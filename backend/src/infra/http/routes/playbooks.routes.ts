import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { makePlaybooksUseCases } from '@/application/contracts/makePlaybooksUseCases.js'
import { replyError } from '@/shared/errors/HttpError.js'
import { authenticate } from '@/infra/http/middlewares/authenticate.js'

// ─── Response helpers ─────────────────────────────────────────────────────────

type ApiSuccess<T> = { success: true; data: T; meta?: unknown; message?: string }

function ok<T>(reply: FastifyReply, data: T, opts?: { meta?: unknown; message?: string }) {
  const payload: ApiSuccess<T> = { success: true, data }
  if (opts?.meta) payload.meta = opts.meta
  if (opts?.message) payload.message = opts.message
  return reply.send(payload)
}

function fail(reply: FastifyReply, code: number, message: string) {
  return reply.code(code).send({ success: false, message })
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
  return {
    tenantId,
    userId,
    role: typeof role === 'string' ? role : 'USER',
    isSystemAdmin: false,
  } as const
}

async function requireAdmin(
  request: FastifyRequest,
  reply: FastifyReply,
  repo: ReturnType<typeof makePlaybooksUseCases>['repo'],
): Promise<({ isSystemAdmin: false; tenantId: number; userId: number; role: string }) | null> {
  const ctx = getAuthContext(request)
  if (!ctx) {
    fail(reply, 401, 'Não autenticado')
    return null
  }
  if (ctx.isSystemAdmin) {
    fail(reply, 403, 'Tenant não selecionado')
    return null
  }
  const role = await repo.getTenantUserRole(ctx.tenantId, ctx.userId)
  if (!role) {
    fail(reply, 403, 'Tenant não selecionado')
    return null
  }
  if (role !== 'ADMIN') {
    fail(reply, 403, 'Acesso negado')
    return null
  }
  return ctx
}

// ─── Zod schemas ──────────────────────────────────────────────────────────────

const idParam = z.object({ id: z.coerce.number().int().positive() })

const playbookPassoSchema = z.object({
  ordemExecucao: z.number().int().min(1),
  tipoAcao: z.string().min(2),
  nomePasso: z.string().min(2),
  descricao: z.string().optional().nullable(),
  configuracaoJson: z.unknown().optional().nullable(),
  timeoutSegundos: z.number().int().optional().nullable(),
  continuaEmErro: z.boolean().optional().default(false),
  reversivel: z.boolean().optional().default(false),
  acaoCompensacaoJson: z.unknown().optional().nullable(),
  riscoAcao: z.enum(['BAIXO', 'MEDIO', 'ALTO', 'CRITICO']).default('BAIXO'),
})

const createPlaybookSchema = z.object({
  codigo: z.string().min(2),
  nome: z.string().min(2),
  descricao: z.string().optional().nullable(),
  categoria: z.string().optional().nullable(),
  modoExecucao: z.enum(['MANUAL', 'SEMI_AUTOMATICO', 'AUTOMATICO']).default('MANUAL'),
  gatilhoTipo: z
    .enum(['ALERTA_ABERTO', 'ALERTA_CRITICO', 'INCIDENTE_ABERTO', 'EVENTO_CORRELACIONADO', 'AGENDADO', 'MANUAL'])
    .default('MANUAL'),
  filtroEventoJson: z.unknown().optional().nullable(),
  filtroAlertaJson: z.unknown().optional().nullable(),
  filtroIncidenteJson: z.unknown().optional().nullable(),
  riscoPadrao: z.enum(['BAIXO', 'MEDIO', 'ALTO', 'CRITICO']).default('BAIXO'),
  politicaAprovacao: z
    .enum(['NAO_EXIGE', 'EXIGE_ANTES', 'EXIGE_SE_RISCO_ALTO', 'QUATRO_OLHOS'])
    .default('EXIGE_SE_RISCO_ALTO'),
  ativo: z.boolean().default(true),
  ordemPrioridade: z.number().int().default(1000),
  passos: z.array(playbookPassoSchema).default([]),
})

const updatePlaybookSchema = z.object({
  nome: z.string().optional(),
  descricao: z.string().optional().nullable(),
  categoria: z.string().optional().nullable(),
  modoExecucao: z.enum(['MANUAL', 'SEMI_AUTOMATICO', 'AUTOMATICO']).optional(),
  gatilhoTipo: z
    .enum(['ALERTA_ABERTO', 'ALERTA_CRITICO', 'INCIDENTE_ABERTO', 'EVENTO_CORRELACIONADO', 'AGENDADO', 'MANUAL'])
    .optional(),
  filtroEventoJson: z.unknown().optional().nullable(),
  filtroAlertaJson: z.unknown().optional().nullable(),
  filtroIncidenteJson: z.unknown().optional().nullable(),
  riscoPadrao: z.enum(['BAIXO', 'MEDIO', 'ALTO', 'CRITICO']).optional(),
  politicaAprovacao: z.enum(['NAO_EXIGE', 'EXIGE_ANTES', 'EXIGE_SE_RISCO_ALTO', 'QUATRO_OLHOS']).optional(),
  ativo: z.boolean().optional(),
  ordemPrioridade: z.number().int().optional(),
  passos: z.array(playbookPassoSchema).optional(),
})

const listQuerySchema = z.object({
  pagina: z.coerce.number().int().min(1).default(1),
  limite: z.coerce.number().int().min(1).max(100).default(30),
  status: z.string().optional(),
  ativo: z.string().optional(),
})

const executarBodySchema = z
  .object({
    alertaId: z.number().int().optional().nullable(),
    incidenteId: z.number().int().optional().nullable(),
    eventoOrigemId: z.number().int().optional().nullable(),
    modoExecucao: z.enum(['MANUAL', 'SEMI_AUTOMATICO', 'AUTOMATICO']).optional().nullable(),
  })
  .optional()

const createCasoSchema = z.object({
  incidenteId: z.number().int().optional().nullable(),
  tipoCaso: z.enum(['LGPD', 'SEGURANCA', 'TERCEIRO', 'AUDITORIA', 'DOCUMENTAL']),
  criticidade: z.enum(['BAIXA', 'MEDIA', 'ALTA', 'CRITICA']).default('MEDIA'),
  ownerUserId: z.number().int().optional().nullable(),
  prazoRespostaEm: z.string().optional().nullable(),
  prazoConclusaoEm: z.string().optional().nullable(),
})

const createEvidenciaSchema = z.object({
  tipoEvidencia: z.string().min(2),
  referenciaTipo: z.string().optional().nullable(),
  referenciaId: z.number().int().optional().nullable(),
  descricao: z.string().optional().nullable(),
  arquivoPath: z.string().optional().nullable(),
  hashSha256: z.string().optional().nullable(),
  metadataJson: z.unknown().optional().nullable(),
})

const createTimelineSchema = z.object({
  tipoEventoTimeline: z.string().min(2),
  titulo: z.string().min(2),
  descricao: z.string().optional().nullable(),
  metadataJson: z.unknown().optional().nullable(),
})

// ─── Routes ───────────────────────────────────────────────────────────────────

export default async function playbooksRoutes(server: FastifyInstance) {
  const {
    createPlaybook,
    updatePlaybook,
    simularPlaybook,
    executarPlaybook,
    aprovarExecucao,
    cancelarExecucao,
    createIncidenteTimeline,
    createCasoCompliance,
    createEvidencia,
    encerrarCasoCompliance,
    listPlaybooks,
    getPlaybookById,
    listExecucoes,
    listIncidenteTimeline,
    listCasosCompliance,
    getCasoComplianceById,
    repo,
  } = makePlaybooksUseCases()

  server.addHook('onRequest', authenticate)

  // ── Playbooks ─────────────────────────────────────────────────────────────

  server.get('/playbooks', async (request, reply) => {
    const ctx = await requireAdmin(request, reply, repo)
    if (!ctx) return

    const q = listQuerySchema.parse(request.query ?? {})
    const ativo = q.ativo !== undefined ? String(q.ativo).toLowerCase() === 'true' : undefined

    try {
      const result = await listPlaybooks.execute({
        tenantId: ctx.tenantId,
        ativo,
        pagina: q.pagina,
        limite: q.limite,
      })
      return ok(reply, result.rows, {
        meta: { pagina: result.pagina, limite: result.limite, total: result.total },
      })
    } catch (err) {
      return replyError(reply, err)
    }
  })

  server.post('/playbooks', { schema: { body: createPlaybookSchema } }, async (request, reply) => {
    const ctx = await requireAdmin(request, reply, repo)
    if (!ctx) return

    const body = request.body as z.infer<typeof createPlaybookSchema>
    try {
      const result = await createPlaybook.execute({ tenantId: ctx.tenantId, ...body })
      return ok(reply, { id: result.id }, { message: 'Playbook criado' })
    } catch (err) {
      return replyError(reply, err)
    }
  })

  server.get('/playbooks/:id', { schema: { params: idParam } }, async (request, reply) => {
    const ctx = await requireAdmin(request, reply, repo)
    if (!ctx) return

    const { id } = request.params as z.infer<typeof idParam>
    try {
      const pb = await getPlaybookById.execute({ tenantId: ctx.tenantId, id })
      return ok(reply, pb)
    } catch (err) {
      return replyError(reply, err)
    }
  })

  server.put(
    '/playbooks/:id',
    { schema: { params: idParam, body: updatePlaybookSchema } },
    async (request, reply) => {
      const ctx = await requireAdmin(request, reply, repo)
      if (!ctx) return

      const { id } = request.params as z.infer<typeof idParam>
      const body = request.body as z.infer<typeof updatePlaybookSchema>
      try {
        await updatePlaybook.execute({ tenantId: ctx.tenantId, id, ...body })
        return ok(reply, { ok: true }, { message: 'Playbook atualizado' })
      } catch (err) {
        return replyError(reply, err)
      }
    },
  )

  server.post(
    '/playbooks/:id/simular',
    { schema: { params: idParam } },
    async (request, reply) => {
      const ctx = await requireAdmin(request, reply, repo)
      if (!ctx) return

      const { id } = request.params as z.infer<typeof idParam>
      try {
        const res = await simularPlaybook.execute({ tenantId: ctx.tenantId, playbookId: id })
        if (!res.ok) return fail(reply, 404, 'Playbook não encontrado')
        return ok(reply, res)
      } catch (err) {
        return replyError(reply, err)
      }
    },
  )

  server.post(
    '/playbooks/:id/executar',
    { schema: { params: idParam, body: executarBodySchema } },
    async (request, reply) => {
      const ctx = await requireAdmin(request, reply, repo)
      if (!ctx) return

      const { id } = request.params as z.infer<typeof idParam>
      const body = (request.body as z.infer<typeof executarBodySchema>) ?? {}
      try {
        const res = await executarPlaybook.execute({
          tenantId: ctx.tenantId,
          executorUserId: ctx.userId,
          playbookId: id,
          alertaId: body?.alertaId ?? null,
          incidenteId: body?.incidenteId ?? null,
          eventoOrigemId: body?.eventoOrigemId ?? null,
          modoExecucao: body?.modoExecucao ?? undefined,
        })
        if (!res.ok) return fail(reply, 400, res.reason)
        return ok(reply, res, { message: 'Execução registrada' })
      } catch (err) {
        return replyError(reply, err)
      }
    },
  )

  // ── Execuções ─────────────────────────────────────────────────────────────

  server.get('/playbooks/execucoes', async (request, reply) => {
    const ctx = await requireAdmin(request, reply, repo)
    if (!ctx) return

    const q = listQuerySchema.parse(request.query ?? {})
    try {
      const result = await listExecucoes.execute({
        tenantId: ctx.tenantId,
        status: q.status,
        pagina: q.pagina,
        limite: q.limite,
      })
      return ok(reply, result.rows, {
        meta: { pagina: result.pagina, limite: result.limite, total: result.total },
      })
    } catch (err) {
      return replyError(reply, err)
    }
  })

  server.post(
    '/playbooks/execucoes/:id/aprovar',
    { schema: { params: idParam } },
    async (request, reply) => {
      const ctx = await requireAdmin(request, reply, repo)
      if (!ctx) return

      const { id } = request.params as z.infer<typeof idParam>
      try {
        const res = await aprovarExecucao.execute({
          tenantId: ctx.tenantId,
          aprovadorUserId: ctx.userId,
          execucaoId: id,
        })
        if (!res.ok) return fail(reply, 400, res.reason)
        return ok(reply, res, { message: 'Execução aprovada' })
      } catch (err) {
        return replyError(reply, err)
      }
    },
  )

  server.post(
    '/playbooks/execucoes/:id/cancelar',
    {
      schema: {
        params: idParam,
        body: z.object({ motivo: z.string().optional().nullable() }),
      },
    },
    async (request, reply) => {
      const ctx = await requireAdmin(request, reply, repo)
      if (!ctx) return

      const { id } = request.params as z.infer<typeof idParam>
      const body = request.body as { motivo?: string | null }
      try {
        const res = await cancelarExecucao.execute({
          tenantId: ctx.tenantId,
          userId: ctx.userId,
          execucaoId: id,
          motivo: body?.motivo ?? null,
        })
        if (!res.ok) return fail(reply, 400, res.reason)
        return ok(reply, res, { message: 'Execução cancelada' })
      } catch (err) {
        return replyError(reply, err)
      }
    },
  )

  // ── Incidente timeline ────────────────────────────────────────────────────

  server.get(
    '/incidentes/:id/timeline',
    { schema: { params: idParam } },
    async (request, reply) => {
      const ctx = await requireAdmin(request, reply, repo)
      if (!ctx) return

      const { id } = request.params as z.infer<typeof idParam>
      try {
        const rows = await listIncidenteTimeline.execute({
          tenantId: ctx.tenantId,
          incidenteId: id,
        })
        return ok(reply, rows)
      } catch (err) {
        return replyError(reply, err)
      }
    },
  )

  server.post(
    '/incidentes/:id/timeline',
    { schema: { params: idParam, body: createTimelineSchema } },
    async (request, reply) => {
      const ctx = await requireAdmin(request, reply, repo)
      if (!ctx) return

      const { id } = request.params as z.infer<typeof idParam>
      const body = request.body as z.infer<typeof createTimelineSchema>
      try {
        const result = await createIncidenteTimeline.execute({
          tenantId: ctx.tenantId,
          incidenteId: id,
          tipoEventoTimeline: body.tipoEventoTimeline,
          titulo: body.titulo,
          descricao: body.descricao ?? null,
          autorUserId: ctx.userId,
          metadataJson: body.metadataJson ?? null,
        })
        return ok(reply, { id: result.id }, { message: 'Timeline registrada' })
      } catch (err) {
        return replyError(reply, err)
      }
    },
  )

  // ── Compliance casos ──────────────────────────────────────────────────────

  server.get('/compliance/casos', async (request, reply) => {
    const ctx = await requireAdmin(request, reply, repo)
    if (!ctx) return

    const q = listQuerySchema.parse(request.query ?? {})
    try {
      const result = await listCasosCompliance.execute({
        tenantId: ctx.tenantId,
        status: q.status,
        pagina: q.pagina,
        limite: q.limite,
      })
      return ok(reply, result.rows, {
        meta: { pagina: result.pagina, limite: result.limite, total: result.total },
      })
    } catch (err) {
      return replyError(reply, err)
    }
  })

  server.post(
    '/compliance/casos',
    { schema: { body: createCasoSchema } },
    async (request, reply) => {
      const ctx = await requireAdmin(request, reply, repo)
      if (!ctx) return

      const body = request.body as z.infer<typeof createCasoSchema>
      try {
        const result = await createCasoCompliance.execute({
          tenantId: ctx.tenantId,
          incidenteId: body.incidenteId ?? null,
          tipoCaso: body.tipoCaso,
          criticidade: body.criticidade,
          ownerUserId: body.ownerUserId ?? null,
          prazoRespostaEm: body.prazoRespostaEm ? new Date(body.prazoRespostaEm) : null,
          prazoConclusaoEm: body.prazoConclusaoEm ? new Date(body.prazoConclusaoEm) : null,
        })
        return ok(reply, { id: result.id }, { message: 'Caso criado' })
      } catch (err) {
        return replyError(reply, err)
      }
    },
  )

  server.get(
    '/compliance/casos/:id',
    { schema: { params: idParam } },
    async (request, reply) => {
      const ctx = await requireAdmin(request, reply, repo)
      if (!ctx) return

      const { id } = request.params as z.infer<typeof idParam>
      try {
        const row = await getCasoComplianceById.execute({ tenantId: ctx.tenantId, id })
        return ok(reply, row)
      } catch (err) {
        return replyError(reply, err)
      }
    },
  )

  server.post(
    '/compliance/casos/:id/evidencias',
    { schema: { params: idParam, body: createEvidenciaSchema } },
    async (request, reply) => {
      const ctx = await requireAdmin(request, reply, repo)
      if (!ctx) return

      const { id } = request.params as z.infer<typeof idParam>
      const body = request.body as z.infer<typeof createEvidenciaSchema>
      try {
        const result = await createEvidencia.execute({
          tenantId: ctx.tenantId,
          casoId: id,
          tipoEvidencia: body.tipoEvidencia,
          referenciaTipo: body.referenciaTipo ?? null,
          referenciaId: body.referenciaId ?? null,
          descricao: body.descricao ?? null,
          arquivoPath: body.arquivoPath ?? null,
          hashSha256: body.hashSha256 ?? null,
          metadataJson: body.metadataJson ?? null,
        })
        return ok(reply, { id: result.id }, { message: 'Evidência adicionada' })
      } catch (err) {
        return replyError(reply, err)
      }
    },
  )

  server.post(
    '/compliance/casos/:id/encerrar',
    {
      schema: {
        params: idParam,
        body: z.object({ parecerFinal: z.string().min(3) }),
      },
    },
    async (request, reply) => {
      const ctx = await requireAdmin(request, reply, repo)
      if (!ctx) return

      const { id } = request.params as z.infer<typeof idParam>
      const body = request.body as { parecerFinal: string }
      try {
        await encerrarCasoCompliance.execute({
          tenantId: ctx.tenantId,
          id,
          parecerFinal: body.parecerFinal,
        })
        return ok(reply, { ok: true }, { message: 'Caso encerrado' })
      } catch (err) {
        return replyError(reply, err)
      }
    },
  )
}
