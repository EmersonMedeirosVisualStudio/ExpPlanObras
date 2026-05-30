import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { authenticate } from '@/utils/authenticate.js'
import { makeGovernancaDadosUseCases } from '@/modules/governanca-dados/application/factories/makeGovernancaDadosUseCases.js'
import { sincronizarCatalogoBasico } from '@/modules/governanca-dados/scanner.js'
import { executarScanPiiAmostral } from '@/modules/governanca-dados/pii-scanner.js'
import { aceitarSugestaoClassificacao, rejeitarSugestaoClassificacao } from '@/modules/governanca-dados/classificacao.js'
import { auditGovernanca } from '@/modules/governanca-dados/audit.js'
import { calcularScoreQualidadePorAtivo } from '@/modules/governanca-dados/quality.js'
import { AtivoNotFoundError, GovernancaForbiddenError, PiiScanNotFoundError, QualidadeRegraNotFoundError } from '@/modules/governanca-dados/domain/errors/GovernancaErrors.js'
import { AppError } from '@/shared/errors/AppError.js'

// ─── Response helpers ─────────────────────────────────────────────────────────

type ApiSuccess<T> = { success: true; message?: string; data: T; meta?: unknown }
type ApiError = { success: false; message: string; errors?: Record<string, string[]> }

function ok<T>(reply: FastifyReply, data: T, input?: { message?: string; meta?: unknown }) {
  const payload: ApiSuccess<T> = { success: true, data }
  if (input?.message) payload.message = input.message
  if (input?.meta) payload.meta = input.meta
  return reply.send(payload)
}

function fail(reply: FastifyReply, code: number, message: string, errors?: Record<string, string[]>) {
  const payload: ApiError = { success: false, message }
  if (errors && Object.keys(errors).length > 0) payload.errors = errors
  return reply.code(code).send(payload)
}

function handleError(reply: FastifyReply, err: unknown) {
  if (err instanceof AtivoNotFoundError || err instanceof PiiScanNotFoundError || err instanceof QualidadeRegraNotFoundError) {
    return fail(reply, err.statusCode, err.message)
  }
  if (err instanceof GovernancaForbiddenError) {
    return fail(reply, err.statusCode, err.message)
  }
  if (err instanceof AppError) {
    return fail(reply, err.statusCode, err.message)
  }
  throw err
}

// ─── Auth context ─────────────────────────────────────────────────────────────

type AuthCtx =
  | { isSystemAdmin: true; tenantId: number | null; userId: number; role: string }
  | { isSystemAdmin: false; tenantId: number; userId: number; role: string }

function getAuthContext(request: FastifyRequest): AuthCtx | null {
  const u = request.user as Record<string, unknown>
  const tenantId = u?.tenantId
  const userId = u?.userId
  const role = u?.role
  const isSystemAdmin = Boolean(u?.isSystemAdmin)
  if (typeof userId !== 'number') return null
  if (isSystemAdmin)
    return {
      tenantId: typeof tenantId === 'number' ? tenantId : null,
      userId,
      role: typeof role === 'string' ? role : 'SYSTEM_ADMIN',
      isSystemAdmin: true,
    } as const
  if (typeof tenantId !== 'number') return null
  return { tenantId, userId, role: typeof role === 'string' ? role : 'USER', isSystemAdmin: false } as const
}

async function requireGovernancaAdmin(
  request: FastifyRequest,
  reply: FastifyReply,
  repo: ReturnType<typeof makeGovernancaDadosUseCases>['repo'],
): Promise<({ tenantId: number; userId: number; role: string; isSystemAdmin: boolean }) | null> {
  const ctx = getAuthContext(request)
  if (!ctx) { fail(reply, 401, 'Não autenticado'); return null }
  if (ctx.isSystemAdmin) {
    if (ctx.tenantId == null) { fail(reply, 403, 'Tenant não selecionado'); return null }
    return { ...ctx, tenantId: ctx.tenantId }
  }
  const tenantUser = await repo.findTenantUser(ctx.tenantId, ctx.userId)
  if (!tenantUser) { fail(reply, 403, 'Tenant não selecionado'); return null }
  if (tenantUser.role !== 'ADMIN') { fail(reply, 403, 'Acesso negado'); return null }
  return ctx
}

// ─── Routes ───────────────────────────────────────────────────────────────────

export default async function governancaDadosRoutes(server: FastifyInstance) {
  const uc = makeGovernancaDadosUseCases()

  server.addHook('onRequest', authenticate)

  // ── Sync catalog ──────────────────────────────────────────────────────────

  server.post('/sincronizar', async (request, reply) => {
    const ctx = await requireGovernancaAdmin(request, reply, uc.repo)
    if (!ctx) return
    const result = await sincronizarCatalogoBasico({ tenantId: ctx.tenantId })
    return ok(reply, result, { message: 'Sincronização concluída' })
  })

  // ── PII Scans ─────────────────────────────────────────────────────────────

  server.post(
    '/pii-scans',
    {
      schema: {
        body: z.object({
          ativoId: z.number().int(),
          sampleSize: z.number().int().min(1).max(50).optional().nullable(),
        }),
      },
    },
    async (request, reply) => {
      const ctx = await requireGovernancaAdmin(request, reply, uc.repo)
      if (!ctx) return
      if (ctx.isSystemAdmin) return fail(reply, 403, 'Tenant não selecionado')
      const body = request.body as { ativoId: number; sampleSize?: number | null }

      const res = await executarScanPiiAmostral({
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        ativoId: body.ativoId,
        sampleSize: body.sampleSize ?? undefined,
      })
      await auditGovernanca({
        tenantId: ctx.tenantId,
        tipoEvento: 'PII_SCAN_EXECUTADO',
        recursoTipo: 'ATIVO',
        recursoId: body.ativoId,
        userId: ctx.userId,
        detalhesJson: res,
        ip: (request.ip as string) || null,
        userAgent: String(request.headers['user-agent'] || '') || null,
      })
      if (!res.ok) return fail(reply, 400, res.reason || 'Falha no scan')
      return ok(reply, res, { message: 'Scan concluído' })
    },
  )

  server.get('/pii-scans', async (request, reply) => {
    const ctx = await requireGovernancaAdmin(request, reply, uc.repo)
    if (!ctx) return
    if (ctx.isSystemAdmin) return fail(reply, 403, 'Tenant não selecionado')
    const q = z
      .object({
        status: z.string().optional(),
        pagina: z.coerce.number().int().min(1).default(1),
        limite: z.coerce.number().int().min(1).max(100).default(30),
      })
      .parse(request.query ?? {})

    const result = await uc.listPiiScans.execute(ctx.tenantId, {
      pagina: q.pagina,
      limite: q.limite,
      status: q.status,
    })
    return ok(reply, result.rows, { meta: { pagina: q.pagina, limite: q.limite, total: result.total } })
  })

  server.get('/pii-scans/:id/resultados', async (request, reply) => {
    const ctx = await requireGovernancaAdmin(request, reply, uc.repo)
    if (!ctx) return
    if (ctx.isSystemAdmin) return fail(reply, 403, 'Tenant não selecionado')
    const { id } = z.object({ id: z.coerce.number().int() }).parse(request.params ?? {})
    try {
      const rows = await uc.getPiiScanById.executeWithResultados(ctx.tenantId, id)
      return ok(reply, rows)
    } catch (err) {
      return handleError(reply, err)
    }
  })

  // ── Classificacao ─────────────────────────────────────────────────────────

  server.get('/classificacao/sugestoes', async (request, reply) => {
    const ctx = await requireGovernancaAdmin(request, reply, uc.repo)
    if (!ctx) return
    if (ctx.isSystemAdmin) return fail(reply, 403, 'Tenant não selecionado')
    const q = z
      .object({
        status: z.string().optional(),
        pagina: z.coerce.number().int().min(1).default(1),
        limite: z.coerce.number().int().min(1).max(100).default(30),
      })
      .parse(request.query ?? {})

    const result = await uc.listClassificacoes.execute(ctx.tenantId, {
      pagina: q.pagina,
      limite: q.limite,
      status: q.status,
    })
    return ok(reply, result.rows, { meta: { pagina: q.pagina, limite: q.limite, total: result.total } })
  })

  server.post('/classificacao/sugestoes/:id/aceitar', async (request, reply) => {
    const ctx = await requireGovernancaAdmin(request, reply, uc.repo)
    if (!ctx) return
    if (ctx.isSystemAdmin) return fail(reply, 403, 'Tenant não selecionado')
    const { id } = z.object({ id: z.coerce.number().int() }).parse(request.params ?? {})
    const res = await aceitarSugestaoClassificacao({ tenantId: ctx.tenantId, userId: ctx.userId, sugestaoId: id })
    await auditGovernanca({
      tenantId: ctx.tenantId,
      tipoEvento: 'CLASSIFICACAO_SUGESTAO_ACEITA',
      recursoTipo: 'SUGESTAO',
      recursoId: id,
      userId: ctx.userId,
      detalhesJson: res,
      ip: (request.ip as string) || null,
      userAgent: String(request.headers['user-agent'] || '') || null,
    })
    if (!res.ok) return fail(reply, 400, res.reason || 'Falha')
    return ok(reply, { ok: true }, { message: 'Sugestão aceita' })
  })

  server.post(
    '/classificacao/sugestoes/:id/rejeitar',
    {
      schema: {
        params: z.object({ id: z.coerce.number().int() }),
        body: z.object({ motivo: z.string().optional().nullable() }),
      },
    },
    async (request, reply) => {
      const ctx = await requireGovernancaAdmin(request, reply, uc.repo)
      if (!ctx) return
      if (ctx.isSystemAdmin) return fail(reply, 403, 'Tenant não selecionado')
      const { id } = request.params as { id: number }
      const body = request.body as { motivo?: string | null }
      const res = await rejeitarSugestaoClassificacao({
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        sugestaoId: Number(id),
        motivo: body.motivo ?? null,
      })
      await auditGovernanca({
        tenantId: ctx.tenantId,
        tipoEvento: 'CLASSIFICACAO_SUGESTAO_REJEITADA',
        recursoTipo: 'SUGESTAO',
        recursoId: Number(id),
        userId: ctx.userId,
        detalhesJson: { ...res, motivo: body.motivo ?? null },
        ip: (request.ip as string) || null,
        userAgent: String(request.headers['user-agent'] || '') || null,
      })
      if (!res.ok) return fail(reply, 400, res.reason || 'Falha')
      return ok(reply, { ok: true }, { message: 'Sugestão rejeitada' })
    },
  )

  // ── Dominios ──────────────────────────────────────────────────────────────

  server.get('/dominios', async (request, reply) => {
    const ctx = await requireGovernancaAdmin(request, reply, uc.repo)
    if (!ctx) return
    const rows = await uc.listDominios.execute(ctx.tenantId)
    return ok(reply, rows)
  })

  server.post(
    '/dominios',
    {
      schema: {
        body: z.object({
          codigoDominio: z.string().min(2),
          nomeDominio: z.string().min(2),
          descricaoDominio: z.string().optional().nullable(),
          ativo: z.boolean().default(true),
        }),
      },
    },
    async (request, reply) => {
      const ctx = await requireGovernancaAdmin(request, reply, uc.repo)
      if (!ctx) return
      const body = request.body as {
        codigoDominio: string
        nomeDominio: string
        descricaoDominio?: string | null
        ativo: boolean
      }
      const created = await uc.createDominio.execute(ctx.tenantId, {
        codigoDominio: body.codigoDominio.toUpperCase(),
        nomeDominio: body.nomeDominio,
        descricaoDominio: body.descricaoDominio ?? null,
        ativo: body.ativo !== false,
      })
      return ok(reply, { id: created.id }, { message: 'Domínio criado' })
    },
  )

  // ── Ativos ────────────────────────────────────────────────────────────────

  server.get('/ativos', async (request, reply) => {
    const ctx = await requireGovernancaAdmin(request, reply, uc.repo)
    if (!ctx) return
    const q = z
      .object({
        tipo: z.string().optional(),
        dominio: z.string().optional(),
        pagina: z.coerce.number().int().min(1).default(1),
        limite: z.coerce.number().int().min(1).max(100).default(30),
      })
      .parse(request.query ?? {})

    let dominioId: number | undefined
    if (q.dominio) {
      const dom = await uc.repo.findDominioByCode(ctx.tenantId, q.dominio.toUpperCase())
      if (!dom) return ok(reply, [], { meta: { pagina: q.pagina, limite: q.limite, total: 0 } })
      dominioId = dom.id
    }

    const result = await uc.listAtivos.execute(ctx.tenantId, {
      pagina: q.pagina,
      limite: q.limite,
      tipo: q.tipo,
      dominioId,
    })

    return ok(
      reply,
      result.rows.map((r) => ({
        id: r.id,
        codigoAtivo: r.codigoAtivo,
        nomeAtivo: r.nomeAtivo,
        tipoAtivo: r.tipoAtivo,
        dominioNome: r.dominio?.nomeDominio ?? null,
        classificacaoGlobal: r.classificacaoGlobal,
        criticidadeNegocio: r.criticidadeNegocio,
        statusAtivo: r.statusAtivo,
        ownerNegocioNome: r.ownerNegocio?.name ?? null,
        ownerTecnicoNome: r.ownerTecnico?.name ?? null,
        slaFreshnessMinutos: r.slaFreshnessMinutos,
      })),
      { meta: { pagina: q.pagina, limite: q.limite, total: result.total } },
    )
  })

  server.post(
    '/ativos',
    {
      schema: {
        body: z.object({
          codigoAtivo: z.string().min(2),
          nomeAtivo: z.string().min(2),
          tipoAtivo: z.enum(['TABELA_OPERACIONAL', 'DW_DIM', 'DW_FACT', 'DW_MART', 'DATASET', 'API', 'RELATORIO']),
          dominioCodigo: z.string().optional().nullable(),
          classificacaoGlobal: z.enum(['PUBLICO', 'INTERNO', 'SENSIVEL', 'RESTRITO']).default('INTERNO'),
          criticidadeNegocio: z.enum(['BAIXA', 'MEDIA', 'ALTA', 'CRITICA']).default('MEDIA'),
          schemaNome: z.string().optional().nullable(),
          objetoNome: z.string().optional().nullable(),
          datasetKey: z.string().optional().nullable(),
          origemSistema: z.string().optional().nullable(),
        }),
      },
    },
    async (request, reply) => {
      const ctx = await requireGovernancaAdmin(request, reply, uc.repo)
      if (!ctx) return
      const body = request.body as {
        codigoAtivo: string
        nomeAtivo: string
        tipoAtivo: string
        dominioCodigo?: string | null
        classificacaoGlobal: string
        criticidadeNegocio: string
        schemaNome?: string | null
        objetoNome?: string | null
        datasetKey?: string | null
        origemSistema?: string | null
      }
      const created = await uc.createAtivo.execute(ctx.tenantId, {
        codigoAtivo: body.codigoAtivo,
        nomeAtivo: body.nomeAtivo,
        tipoAtivo: body.tipoAtivo,
        dominioCodigo: body.dominioCodigo ?? null,
        classificacaoGlobal: body.classificacaoGlobal,
        criticidadeNegocio: body.criticidadeNegocio,
        schemaNome: body.schemaNome ?? null,
        objetoNome: body.objetoNome ?? null,
        datasetKey: body.datasetKey ?? null,
        origemSistema: body.origemSistema ?? null,
      })
      return ok(reply, { id: created.id }, { message: 'Ativo criado' })
    },
  )

  server.get('/ativos/:id', async (request, reply) => {
    const ctx = await requireGovernancaAdmin(request, reply, uc.repo)
    if (!ctx) return
    const { id } = z.object({ id: z.coerce.number().int() }).parse(request.params ?? {})
    try {
      const ativo = await uc.getAtivoById.execute(ctx.tenantId, id)
      const score = await calcularScoreQualidadePorAtivo({ tenantId: ctx.tenantId, ativoId: id })
      return ok(reply, {
        id: ativo.id,
        codigoAtivo: ativo.codigoAtivo,
        nomeAtivo: ativo.nomeAtivo,
        tipoAtivo: ativo.tipoAtivo,
        descricaoAtivo: ativo.descricaoAtivo,
        origemSistema: ativo.origemSistema,
        schemaNome: ativo.schemaNome,
        objetoNome: ativo.objetoNome,
        datasetKey: ativo.datasetKey,
        classificacaoGlobal: ativo.classificacaoGlobal,
        criticidadeNegocio: ativo.criticidadeNegocio,
        slaFreshnessMinutos: ativo.slaFreshnessMinutos,
        statusAtivo: ativo.statusAtivo,
        dominio: ativo.dominio,
        ownerNegocio: ativo.ownerNegocio,
        ownerTecnico: ativo.ownerTecnico,
        steward: ativo.steward,
        custodiante: ativo.custodiante,
        metadataJson: ativo.metadataJson,
        qualidade: score,
        createdAt: ativo.createdAt.toISOString(),
        updatedAt: ativo.updatedAt.toISOString(),
      })
    } catch (err) {
      return handleError(reply, err)
    }
  })

  // ── Ativo Campos ──────────────────────────────────────────────────────────

  server.get('/ativos/:id/campos', async (request, reply) => {
    const ctx = await requireGovernancaAdmin(request, reply, uc.repo)
    if (!ctx) return
    const { id } = z.object({ id: z.coerce.number().int() }).parse(request.params ?? {})
    try {
      const campos = await uc.listAtivoCampos.execute(ctx.tenantId, id)
      return ok(reply, campos)
    } catch (err) {
      return handleError(reply, err)
    }
  })

  server.post(
    '/ativos/:id/campos',
    {
      schema: {
        params: z.object({ id: z.coerce.number().int() }),
        body: z.object({
          caminhoCampo: z.string().min(1),
          nomeCampoExibicao: z.string().min(1),
          tipoDado: z.string().min(1),
          descricaoCampo: z.string().optional().nullable(),
          classificacaoCampo: z.enum(['PUBLICO', 'INTERNO', 'SENSIVEL', 'RESTRITO']).default('INTERNO'),
          pii: z.boolean().default(false),
          campoChave: z.boolean().default(false),
          campoObrigatorio: z.boolean().default(false),
          campoMascaravel: z.boolean().default(false),
          estrategiaMascaraPadrao: z.string().optional().nullable(),
          origemCampo: z.string().optional().nullable(),
          ativo: z.boolean().default(true),
          metadataJson: z.unknown().optional().nullable(),
        }),
      },
    },
    async (request, reply) => {
      const ctx = await requireGovernancaAdmin(request, reply, uc.repo)
      if (!ctx) return
      const { id } = request.params as { id: number }
      const body = request.body as {
        caminhoCampo: string
        nomeCampoExibicao: string
        tipoDado: string
        descricaoCampo?: string | null
        classificacaoCampo: string
        pii: boolean
        campoChave: boolean
        campoObrigatorio: boolean
        campoMascaravel: boolean
        estrategiaMascaraPadrao?: string | null
        origemCampo?: string | null
        ativo: boolean
        metadataJson?: unknown
      }
      try {
        const saved = await uc.upsertAtivoCampo.execute(ctx.tenantId, Number(id), {
          caminhoCampo: body.caminhoCampo,
          nomeCampoExibicao: body.nomeCampoExibicao,
          tipoDado: body.tipoDado,
          descricaoCampo: body.descricaoCampo ?? null,
          classificacaoCampo: body.classificacaoCampo,
          pii: Boolean(body.pii),
          campoChave: Boolean(body.campoChave),
          campoObrigatorio: Boolean(body.campoObrigatorio),
          campoMascaravel: Boolean(body.campoMascaravel),
          estrategiaMascaraPadrao: body.estrategiaMascaraPadrao ?? null,
          origemCampo: body.origemCampo ?? null,
          ativo: body.ativo !== false,
          metadataJson: body.metadataJson ?? null,
        })
        return ok(reply, saved, { message: 'Campo salvo' })
      } catch (err) {
        return handleError(reply, err)
      }
    },
  )

  // ── Lineage ───────────────────────────────────────────────────────────────

  server.get('/ativos/:id/lineage', async (request, reply) => {
    const ctx = await requireGovernancaAdmin(request, reply, uc.repo)
    if (!ctx) return
    const { id } = z.object({ id: z.coerce.number().int() }).parse(request.params ?? {})
    try {
      const rows = await uc.listLineageRelacoes.execute(ctx.tenantId, id)
      return ok(
        reply,
        rows.map((r) => ({
          ativoOrigemId: r.ativoOrigemId,
          ativoOrigemNome: r.ativoOrigem.nomeAtivo,
          ativoDestinoId: r.ativoDestinoId,
          ativoDestinoNome: r.ativoDestino.nomeAtivo,
          tipoRelacao: r.tipoRelacao,
          nivelRelacao: r.nivelRelacao,
          campoOrigem: r.campoOrigem,
          campoDestino: r.campoDestino,
        })),
      )
    } catch (err) {
      return handleError(reply, err)
    }
  })

  server.post(
    '/lineage',
    {
      schema: {
        body: z.object({
          ativoOrigemId: z.number().int(),
          ativoDestinoId: z.number().int(),
          tipoRelacao: z.enum(['ALIMENTA', 'TRANSFORMA', 'AGREGA', 'EXPOE', 'EXPORTA']),
          nivelRelacao: z.enum(['ATIVO', 'CAMPO']).default('ATIVO'),
          campoOrigem: z.string().optional().nullable(),
          campoDestino: z.string().optional().nullable(),
          transformacaoResumo: z.string().optional().nullable(),
          pipelineNome: z.string().optional().nullable(),
          ativo: z.boolean().default(true),
        }),
      },
    },
    async (request, reply) => {
      const ctx = await requireGovernancaAdmin(request, reply, uc.repo)
      if (!ctx) return
      const body = request.body as {
        ativoOrigemId: number
        ativoDestinoId: number
        tipoRelacao: string
        nivelRelacao: string
        campoOrigem?: string | null
        campoDestino?: string | null
        transformacaoResumo?: string | null
        pipelineNome?: string | null
        ativo: boolean
      }
      try {
        const created = await uc.createLineageRelacao.execute(ctx.tenantId, {
          ativoOrigemId: body.ativoOrigemId,
          ativoDestinoId: body.ativoDestinoId,
          tipoRelacao: body.tipoRelacao,
          nivelRelacao: body.nivelRelacao,
          campoOrigem: body.campoOrigem ?? null,
          campoDestino: body.campoDestino ?? null,
          transformacaoResumo: body.transformacaoResumo ?? null,
          pipelineNome: body.pipelineNome ?? null,
          ativo: body.ativo !== false,
        })
        return ok(reply, { id: created.id }, { message: 'Lineage criado' })
      } catch (err) {
        return handleError(reply, err)
      }
    },
  )

  // ── Glossario ─────────────────────────────────────────────────────────────

  server.get('/glossario', async (request, reply) => {
    const ctx = await requireGovernancaAdmin(request, reply, uc.repo)
    if (!ctx) return
    const q = z
      .object({
        termo: z.string().optional(),
        dominio: z.string().optional(),
        pagina: z.coerce.number().int().min(1).default(1),
        limite: z.coerce.number().int().min(1).max(100).default(30),
      })
      .parse(request.query ?? {})

    let dominioId: number | undefined
    if (q.dominio) {
      const dom = await uc.repo.findDominioByCode(ctx.tenantId, q.dominio.toUpperCase())
      if (!dom) return ok(reply, [], { meta: { pagina: q.pagina, limite: q.limite, total: 0 } })
      dominioId = dom.id
    }

    const result = await uc.listGlossario.execute(ctx.tenantId, {
      pagina: q.pagina,
      limite: q.limite,
      termo: q.termo,
      dominioId,
    })

    return ok(
      reply,
      result.rows.map((r) => ({
        id: r.id,
        termo: r.termo,
        definicao: r.definicao,
        formulaNegocio: r.formulaNegocio,
        exemplosJson: r.exemplosJson,
        dominio: r.dominio,
        owner: r.ownerRef,
        ativo: r.ativo,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
      })),
      { meta: { pagina: q.pagina, limite: q.limite, total: result.total } },
    )
  })

  server.post(
    '/glossario',
    {
      schema: {
        body: z.object({
          termo: z.string().min(2),
          definicao: z.string().min(5),
          formulaNegocio: z.string().optional().nullable(),
          exemplosJson: z.unknown().optional().nullable(),
          dominioCodigo: z.string().optional().nullable(),
          ownerUserId: z.number().int().optional().nullable(),
          ativo: z.boolean().default(true),
        }),
      },
    },
    async (request, reply) => {
      const ctx = await requireGovernancaAdmin(request, reply, uc.repo)
      if (!ctx) return
      const body = request.body as {
        termo: string
        definicao: string
        formulaNegocio?: string | null
        exemplosJson?: unknown
        dominioCodigo?: string | null
        ownerUserId?: number | null
        ativo: boolean
      }
      const created = await uc.createGlossarioEntry.execute(ctx.tenantId, {
        termo: body.termo,
        definicao: body.definicao,
        formulaNegocio: body.formulaNegocio ?? null,
        exemplosJson: body.exemplosJson,
        dominioCodigo: body.dominioCodigo ?? null,
        ownerUserId: typeof body.ownerUserId === 'number' ? body.ownerUserId : null,
        ativo: body.ativo !== false,
      })
      return ok(reply, { id: created.id }, { message: 'Termo criado' })
    },
  )

  // ── Qualidade Regras ──────────────────────────────────────────────────────

  server.get('/qualidade/ativos/:id/regras', async (request, reply) => {
    const ctx = await requireGovernancaAdmin(request, reply, uc.repo)
    if (!ctx) return
    const { id } = z.object({ id: z.coerce.number().int() }).parse(request.params ?? {})
    try {
      const ativo = await uc.getAtivoById.execute(ctx.tenantId, id)
      if (!ativo) return fail(reply, 404, 'Ativo não encontrado')
      const rows = await uc.listQualidadeRegras.executeByAtivo(ctx.tenantId, id)
      return ok(
        reply,
        rows.map((r) => ({
          id: r.id,
          nomeRegra: r.nomeRegra,
          tipoRegra: r.tipoRegra,
          caminhoCampo: r.caminhoCampo,
          severidade: r.severidade,
          ativo: r.ativo,
        })),
      )
    } catch (err) {
      return handleError(reply, err)
    }
  })

  server.get('/qualidade/regras', async (request, reply) => {
    const ctx = await requireGovernancaAdmin(request, reply, uc.repo)
    if (!ctx) return
    const q = z
      .object({
        ativoId: z.coerce.number().int().optional(),
        pagina: z.coerce.number().int().min(1).default(1),
        limite: z.coerce.number().int().min(1).max(100).default(30),
      })
      .parse(request.query ?? {})

    const result = await uc.listQualidadeRegras.execute(ctx.tenantId, {
      pagina: q.pagina,
      limite: q.limite,
      ativoId: q.ativoId,
    })
    return ok(reply, result.rows, { meta: { pagina: q.pagina, limite: q.limite, total: result.total } })
  })

  server.post(
    '/qualidade/regras',
    {
      schema: {
        body: z.object({
          ativoId: z.number().int(),
          caminhoCampo: z.string().optional().nullable(),
          nomeRegra: z.string().min(2),
          tipoRegra: z.enum(['COMPLETUDE', 'UNICIDADE', 'FAIXA', 'VALIDADE', 'REFERENCIAL', 'FRESHNESS', 'VOLUME', 'CONSISTENCIA']),
          severidade: z.enum(['BAIXA', 'MEDIA', 'ALTA', 'CRITICA']).default('MEDIA'),
          configuracaoJson: z.unknown(),
          thresholdOk: z.number().optional().nullable(),
          thresholdAlerta: z.number().optional().nullable(),
          ativo: z.boolean().default(true),
        }),
      },
    },
    async (request, reply) => {
      const ctx = await requireGovernancaAdmin(request, reply, uc.repo)
      if (!ctx) return
      const body = request.body as {
        ativoId: number
        caminhoCampo?: string | null
        nomeRegra: string
        tipoRegra: string
        severidade: string
        configuracaoJson: unknown
        thresholdOk?: number | null
        thresholdAlerta?: number | null
        ativo: boolean
      }
      try {
        const created = await uc.createQualidadeRegra.execute(ctx.tenantId, {
          ativoId: body.ativoId,
          caminhoCampo: body.caminhoCampo ?? null,
          nomeRegra: body.nomeRegra,
          tipoRegra: body.tipoRegra,
          severidade: body.severidade,
          configuracaoJson: body.configuracaoJson,
          thresholdOk: body.thresholdOk ?? null,
          thresholdAlerta: body.thresholdAlerta ?? null,
          ativo: body.ativo !== false,
          criadoPorUserId: ctx.userId,
          atualizadoPorUserId: ctx.userId,
        })
        return ok(reply, { id: created.id }, { message: 'Regra criada' })
      } catch (err) {
        return handleError(reply, err)
      }
    },
  )

  server.put(
    '/qualidade/regras/:id',
    {
      schema: {
        params: z.object({ id: z.coerce.number().int() }),
        body: z.object({
          caminhoCampo: z.string().optional().nullable(),
          nomeRegra: z.string().min(2),
          tipoRegra: z.enum(['COMPLETUDE', 'UNICIDADE', 'FAIXA', 'VALIDADE', 'REFERENCIAL', 'FRESHNESS', 'VOLUME', 'CONSISTENCIA']),
          severidade: z.enum(['BAIXA', 'MEDIA', 'ALTA', 'CRITICA']).default('MEDIA'),
          configuracaoJson: z.unknown(),
          thresholdOk: z.number().optional().nullable(),
          thresholdAlerta: z.number().optional().nullable(),
          ativo: z.boolean().default(true),
        }),
      },
    },
    async (request, reply) => {
      const ctx = await requireGovernancaAdmin(request, reply, uc.repo)
      if (!ctx) return
      const { id } = request.params as { id: number }
      const body = request.body as {
        caminhoCampo?: string | null
        nomeRegra: string
        tipoRegra: string
        severidade: string
        configuracaoJson: unknown
        thresholdOk?: number | null
        thresholdAlerta?: number | null
        ativo: boolean
      }
      try {
        const updated = await uc.updateQualidadeRegra.execute(ctx.tenantId, Number(id), {
          caminhoCampo: body.caminhoCampo ?? null,
          nomeRegra: body.nomeRegra,
          tipoRegra: body.tipoRegra,
          severidade: body.severidade,
          configuracaoJson: body.configuracaoJson,
          thresholdOk: body.thresholdOk ?? null,
          thresholdAlerta: body.thresholdAlerta ?? null,
          ativo: body.ativo !== false,
          atualizadoPorUserId: ctx.userId,
        })
        return ok(reply, { id: updated.id }, { message: 'Regra atualizada' })
      } catch (err) {
        return handleError(reply, err)
      }
    },
  )

  server.post('/qualidade/regras/:id/executar', async (request, reply) => {
    const ctx = await requireGovernancaAdmin(request, reply, uc.repo)
    if (!ctx) return
    const { id } = z.object({ id: z.coerce.number().int() }).parse(request.params ?? {})
    try {
      const result = await uc.executarQualidadeRegra.execute(ctx.tenantId, id)
      return ok(reply, result, { message: 'Execução registrada' })
    } catch (err) {
      return handleError(reply, err)
    }
  })

  // ── Qualidade Issues ──────────────────────────────────────────────────────

  server.get('/qualidade/ativos/:id/issues', async (request, reply) => {
    const ctx = await requireGovernancaAdmin(request, reply, uc.repo)
    if (!ctx) return
    const { id } = z.object({ id: z.coerce.number().int() }).parse(request.params ?? {})
    try {
      const rows = await uc.listQualidadeIssues.executeByAtivo(ctx.tenantId, id)
      return ok(
        reply,
        rows.map((r) => ({
          id: r.id,
          tituloIssue: r.tituloIssue,
          severidade: r.severidade,
          statusIssue: r.statusIssue,
          ultimaOcorrenciaEm: r.ultimaOcorrenciaEm.toISOString(),
          responsavelNome: r.responsavelRef?.name ?? null,
        })),
      )
    } catch (err) {
      return handleError(reply, err)
    }
  })

  server.get('/qualidade/issues', async (request, reply) => {
    const ctx = await requireGovernancaAdmin(request, reply, uc.repo)
    if (!ctx) return
    const q = z
      .object({
        status: z.string().optional(),
        severidade: z.string().optional(),
        pagina: z.coerce.number().int().min(1).default(1),
        limite: z.coerce.number().int().min(1).max(100).default(30),
      })
      .parse(request.query ?? {})

    const result = await uc.listQualidadeIssues.execute(ctx.tenantId, {
      pagina: q.pagina,
      limite: q.limite,
      status: q.status,
      severidade: q.severidade,
    })

    return ok(
      reply,
      result.rows.map((r) => ({
        id: r.id,
        ativoId: r.ativoId,
        ativoNome: r.ativoRef?.nomeAtivo ?? null,
        ativoCodigo: r.ativoRef?.codigoAtivo ?? null,
        regraId: r.regraId,
        tituloIssue: r.tituloIssue,
        severidade: r.severidade,
        statusIssue: r.statusIssue,
        ultimaOcorrenciaEm: r.ultimaOcorrenciaEm.toISOString(),
        responsavelNome: r.responsavelRef?.name ?? null,
      })),
      { meta: { pagina: q.pagina, limite: q.limite, total: result.total } },
    )
  })

  // ── Simulate ──────────────────────────────────────────────────────────────

  server.post(
    '/simular',
    {
      schema: {
        body: z.object({
          ativoId: z.number().int(),
        }),
      },
    },
    async (request, reply) => {
      const ctx = await requireGovernancaAdmin(request, reply, uc.repo)
      if (!ctx) return
      const body = request.body as { ativoId: number }
      try {
        const ativo = await uc.getAtivoById.execute(ctx.tenantId, body.ativoId)
        const score = await calcularScoreQualidadePorAtivo({ tenantId: ctx.tenantId, ativoId: ativo.id })
        const campos = await uc.listAtivoCampos.execute(ctx.tenantId, ativo.id)
        const sensitive = campos.filter(
          (c) =>
            String(c.classificacaoCampo).toUpperCase() === 'SENSIVEL' ||
            String(c.classificacaoCampo).toUpperCase() === 'RESTRITO',
        ).length
        return ok(reply, { ativoId: ativo.id, camposTotal: campos.length, camposSensiveis: sensitive, qualidade: score })
      } catch (err) {
        return handleError(reply, err)
      }
    },
  )
}
