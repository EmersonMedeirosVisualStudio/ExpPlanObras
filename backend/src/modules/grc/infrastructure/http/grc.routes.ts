import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { makeGrcUseCases } from '@/modules/grc/application/factories/makeGrcUseCases.js'
import { GrcForbiddenError, GrcUnauthorizedError } from '@/modules/grc/domain/errors/GrcErrors.js'
import { classificarScore, scoreFromImpactProbability } from '@/modules/grc/score.js'
import { emitObservabilityEvent } from '@/modules/observabilidade/emit.js'
import { replyError } from '@/shared/errors/HttpError.js'
import { authenticate } from '@/shared/middleware/authenticate.js'

// ── Response helpers ──────────────────────────────────────────────────────────

type ApiSuccess<T> = { success: true; data: T; meta?: unknown; message?: string }
type ApiError = { success: false; message: string; errors?: Record<string, string[]> }

function ok<T>(reply: FastifyReply, data: T, input?: { meta?: unknown; message?: string }) {
  const payload: ApiSuccess<T> = { success: true, data }
  if (input?.meta) payload.meta = input.meta
  if (input?.message) payload.message = input.message
  return reply.send(payload)
}

function fail(reply: FastifyReply, code: number, message: string, errors?: Record<string, string[]>) {
  const payload: ApiError = { success: false, message }
  if (errors && Object.keys(errors).length > 0) payload.errors = errors
  return reply.code(code).send(payload)
}

// ── Auth context ──────────────────────────────────────────────────────────────

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

async function requireGrcAdmin(
  request: FastifyRequest,
  reply: FastifyReply,
  useCases: ReturnType<typeof makeGrcUseCases>,
): Promise<(AuthCtx & { isSystemAdmin: false }) | null> {
  const ctx = getAuthContext(request)
  if (!ctx) {
    fail(reply, 401, 'Não autenticado')
    return null
  }
  if (ctx.isSystemAdmin) {
    fail(reply, 403, 'Tenant não selecionado')
    return null
  }
  const tenantUser = await useCases.repo.findTenantUser(ctx.tenantId, ctx.userId)
  if (!tenantUser) {
    fail(reply, 403, 'Acesso negado')
    return null
  }
  if (tenantUser.role !== 'ADMIN') {
    fail(reply, 403, 'Acesso negado')
    return null
  }
  return ctx as AuthCtx & { isSystemAdmin: false }
}

// ── Plugin ────────────────────────────────────────────────────────────────────

export default async function grcRoutes(server: FastifyInstance) {
  server.addHook('onRequest', authenticate)

  const useCases = makeGrcUseCases()

  // ── Riscos ────────────────────────────────────────────────────────────────

  server.get('/riscos', async (request, reply) => {
    const ctx = await requireGrcAdmin(request, reply, useCases)
    if (!ctx) return
    try {
      const q = z
        .object({
          status: z.string().optional(),
          categoria: z.string().optional(),
          pagina: z.coerce.number().int().min(1).default(1),
          limite: z.coerce.number().int().min(1).max(100).default(30),
        })
        .parse(request.query || {})
      const { rows, total } = await useCases.listRiscos.execute({
        tenantId: ctx.tenantId,
        status: q.status,
        categoria: q.categoria,
        pagina: q.pagina,
        limite: q.limite,
      })
      return ok(reply, rows, { meta: { pagina: q.pagina, limite: q.limite, total } })
    } catch (err) {
      return replyError(reply, err)
    }
  })

  server.post(
    '/riscos',
    {
      schema: {
        body: z.object({
          codigo: z.string().min(2),
          titulo: z.string().min(2),
          descricao: z.string().optional().nullable(),
          categoriaRisco: z.string().min(2),
          modulo: z.string().optional().nullable(),
          processoNegocio: z.string().optional().nullable(),
          entidadeTipo: z.string().optional().nullable(),
          entidadeId: z.number().int().optional().nullable(),
          ownerUserId: z.number().int().optional().nullable(),
          statusRisco: z.enum(['ABERTO', 'MONITORANDO', 'MITIGADO', 'ACEITO', 'ENCERRADO']).default('ABERTO'),
          impacto: z.enum(['BAIXO', 'MEDIO', 'ALTO', 'CRITICO']),
          probabilidade: z.enum(['RARO', 'IMPROVAVEL', 'POSSIVEL', 'PROVAVEL', 'QUASE_CERTO']),
          apetiteScore: z.number().int().optional().nullable(),
          toleranciaScore: z.number().int().optional().nullable(),
          origemRisco: z.string().optional().nullable(),
        }),
      },
    },
    async (request, reply) => {
      const ctx = await requireGrcAdmin(request, reply, useCases)
      if (!ctx) return
      try {
        const body = request.body as {
          codigo: string
          titulo: string
          descricao?: string | null
          categoriaRisco: string
          modulo?: string | null
          processoNegocio?: string | null
          entidadeTipo?: string | null
          entidadeId?: number | null
          ownerUserId?: number | null
          statusRisco: string
          impacto: string
          probabilidade: string
          apetiteScore?: number | null
          toleranciaScore?: number | null
          origemRisco?: string | null
        }
        const result = await useCases.createRisco.execute({
          tenantId: ctx.tenantId,
          userId: ctx.userId,
          ...body,
        })
        const score = scoreFromImpactProbability({ impacto: body.impacto, probabilidade: body.probabilidade })
        await emitObservabilityEvent({
          tenantId: ctx.tenantId,
          categoria: 'SECURITY',
          nomeEvento: 'grc.risk.created',
          severidade: score >= 17 ? 'CRITICAL' : score >= 10 ? 'ERROR' : 'INFO',
          resultado: 'SUCESSO',
          origemTipo: 'INTERNAL',
          modulo: 'GRC',
          entidadeTipo: 'GRC_RISCO',
          entidadeId: result.id,
          actorUserId: ctx.userId,
          payload: {
            codigo: result.codigo,
            scoreInerente: result.scoreInerente,
            classe: classificarScore(result.scoreInerente),
            categoriaRisco: result.categoriaRisco,
          },
        })
        return ok(reply, { id: result.id }, { message: 'Risco criado' })
      } catch (err) {
        return replyError(reply, err)
      }
    },
  )

  server.put(
    '/riscos/:id',
    {
      schema: {
        params: z.object({ id: z.coerce.number().int() }),
        body: z.object({
          titulo: z.string().optional(),
          descricao: z.string().optional().nullable(),
          statusRisco: z.string().optional(),
          ownerUserId: z.number().int().optional().nullable(),
          apetiteScore: z.number().int().optional().nullable(),
          toleranciaScore: z.number().int().optional().nullable(),
        }),
      },
    },
    async (request, reply) => {
      const ctx = await requireGrcAdmin(request, reply, useCases)
      if (!ctx) return
      try {
        const { id } = request.params as { id: number }
        const body = request.body as {
          titulo?: string
          descricao?: string | null
          statusRisco?: string
          ownerUserId?: number | null
          apetiteScore?: number | null
          toleranciaScore?: number | null
        }
        await useCases.updateRisco.execute({ id, tenantId: ctx.tenantId, ...body })
        return ok(reply, { ok: true }, { message: 'Risco atualizado' })
      } catch (err) {
        return replyError(reply, err)
      }
    },
  )

  server.get('/riscos/:id/avaliacoes', async (request, reply) => {
    const ctx = await requireGrcAdmin(request, reply, useCases)
    if (!ctx) return
    try {
      const { id } = z.object({ id: z.coerce.number().int() }).parse(request.params || {})
      const rows = await useCases.listRiscoAvaliacoes.execute(id, ctx.tenantId)
      return ok(reply, rows)
    } catch (err) {
      return replyError(reply, err)
    }
  })

  server.post(
    '/riscos/:id/avaliacoes',
    {
      schema: {
        params: z.object({ id: z.coerce.number().int() }),
        body: z.object({
          tipoAvaliacao: z
            .enum(['INICIAL', 'PERIODICA', 'POS_INCIDENTE', 'POS_AUDITORIA', 'POS_REMEDIACAO'])
            .default('PERIODICA'),
          impacto: z.enum(['BAIXO', 'MEDIO', 'ALTO', 'CRITICO']),
          probabilidade: z.enum(['RARO', 'IMPROVAVEL', 'POSSIVEL', 'PROVAVEL', 'QUASE_CERTO']),
          justificativa: z.string().optional().nullable(),
          aplicarComoResidual: z.boolean().default(true),
        }),
      },
    },
    async (request, reply) => {
      const ctx = await requireGrcAdmin(request, reply, useCases)
      if (!ctx) return
      try {
        const { id } = request.params as { id: number }
        const body = request.body as {
          tipoAvaliacao: string
          impacto: string
          probabilidade: string
          justificativa?: string | null
          aplicarComoResidual: boolean
        }
        const { score } = await useCases.addRiscoAvaliacao.execute({
          riscoId: id,
          tenantId: ctx.tenantId,
          userId: ctx.userId,
          tipoAvaliacao: body.tipoAvaliacao,
          impacto: body.impacto,
          probabilidade: body.probabilidade,
          justificativa: body.justificativa,
          aplicarComoResidual: body.aplicarComoResidual,
        })
        await emitObservabilityEvent({
          tenantId: ctx.tenantId,
          categoria: 'SECURITY',
          nomeEvento: 'grc.risk.assessed',
          severidade: score >= 17 ? 'CRITICAL' : score >= 10 ? 'ERROR' : 'INFO',
          resultado: 'SUCESSO',
          origemTipo: 'INTERNAL',
          modulo: 'GRC',
          entidadeTipo: 'GRC_RISCO',
          entidadeId: id,
          actorUserId: ctx.userId,
          payload: { tipoAvaliacao: body.tipoAvaliacao, score, classe: classificarScore(score) },
        })
        return ok(reply, { ok: true, score }, { message: 'Avaliação registrada' })
      } catch (err) {
        return replyError(reply, err)
      }
    },
  )

  server.post('/riscos/:id/recalcular', async (request, reply) => {
    const ctx = await requireGrcAdmin(request, reply, useCases)
    if (!ctx) return
    try {
      const { id } = z.object({ id: z.coerce.number().int() }).parse(request.params || {})
      const result = await useCases.recalcularRiscoResidual.execute(id, ctx.tenantId)
      return ok(reply, { ok: true, ...result })
    } catch (err) {
      return replyError(reply, err)
    }
  })

  // ── Controles ─────────────────────────────────────────────────────────────

  server.get('/controles', async (request, reply) => {
    const ctx = await requireGrcAdmin(request, reply, useCases)
    if (!ctx) return
    try {
      const q = z
        .object({
          ativo: z.string().optional(),
          pagina: z.coerce.number().int().min(1).default(1),
          limite: z.coerce.number().int().min(1).max(100).default(30),
        })
        .parse(request.query || {})
      const { rows, total } = await useCases.listControles.execute({
        tenantId: ctx.tenantId,
        ativo: q.ativo,
        pagina: q.pagina,
        limite: q.limite,
      })
      return ok(reply, rows, { meta: { pagina: q.pagina, limite: q.limite, total } })
    } catch (err) {
      return replyError(reply, err)
    }
  })

  server.post(
    '/controles',
    {
      schema: {
        body: z.object({
          codigo: z.string().min(2),
          nome: z.string().min(2),
          descricao: z.string().optional().nullable(),
          categoriaControle: z.string().optional().nullable(),
          tipoControle: z.enum(['PREVENTIVO', 'DETECTIVO', 'CORRETIVO']),
          automacaoControle: z.enum(['MANUAL', 'SEMI_AUTOMATIZADO', 'AUTOMATIZADO']),
          frequenciaExecucao: z.string().optional().nullable(),
          ownerUserId: z.number().int().optional().nullable(),
          executorTipo: z.string().optional().nullable(),
          evidenciaObrigatoria: z.boolean().default(false),
          ativo: z.boolean().default(true),
          criticidade: z.enum(['BAIXA', 'MEDIA', 'ALTA', 'CRITICA']).default('MEDIA'),
          objetivoControle: z.string().optional().nullable(),
          procedimentoExecucao: z.string().optional().nullable(),
        }),
      },
    },
    async (request, reply) => {
      const ctx = await requireGrcAdmin(request, reply, useCases)
      if (!ctx) return
      try {
        const body = request.body as {
          codigo: string
          nome: string
          descricao?: string | null
          categoriaControle?: string | null
          tipoControle: string
          automacaoControle: string
          frequenciaExecucao?: string | null
          ownerUserId?: number | null
          executorTipo?: string | null
          evidenciaObrigatoria?: boolean
          ativo?: boolean
          criticidade: string
          objetivoControle?: string | null
          procedimentoExecucao?: string | null
        }
        const result = await useCases.createControle.execute({
          tenantId: ctx.tenantId,
          userId: ctx.userId,
          ...body,
        })
        return ok(reply, { id: result.id }, { message: 'Controle criado' })
      } catch (err) {
        return replyError(reply, err)
      }
    },
  )

  server.post(
    '/controles/:id/testes',
    {
      schema: {
        params: z.object({ id: z.coerce.number().int() }),
        body: z.object({
          tipoTeste: z.enum(['DESENHO', 'OPERACAO', 'CONTINUO', 'AUTOMATIZADO']),
          periodoReferencia: z.string().optional().nullable(),
          amostraJson: z.unknown().optional().nullable(),
          resultadoTeste: z.enum(['EFETIVO', 'PARCIALMENTE_EFETIVO', 'INEFETIVO', 'NAO_APLICAVEL']),
          falhasIdentificadas: z.string().optional().nullable(),
          efetividadeScore: z.number().int().min(0).max(100).optional().nullable(),
          conclusao: z.string().optional().nullable(),
        }),
      },
    },
    async (request, reply) => {
      const ctx = await requireGrcAdmin(request, reply, useCases)
      if (!ctx) return
      try {
        const { id } = request.params as { id: number }
        const body = request.body as {
          tipoTeste: string
          periodoReferencia?: string | null
          amostraJson?: unknown
          resultadoTeste: string
          falhasIdentificadas?: string | null
          efetividadeScore?: number | null
          conclusao?: string | null
        }
        const result = await useCases.addControleTeste.execute({
          tenantId: ctx.tenantId,
          userId: ctx.userId,
          controleId: id,
          ...body,
        })
        await emitObservabilityEvent({
          tenantId: ctx.tenantId,
          categoria: 'SECURITY',
          nomeEvento: 'grc.control.tested',
          severidade:
            body.resultadoTeste === 'INEFETIVO'
              ? 'ERROR'
              : body.resultadoTeste === 'PARCIALMENTE_EFETIVO'
                ? 'WARNING'
                : 'INFO',
          resultado: 'SUCESSO',
          origemTipo: 'INTERNAL',
          modulo: 'GRC',
          entidadeTipo: 'GRC_CONTROLE',
          entidadeId: id,
          actorUserId: ctx.userId,
          payload: {
            tipoTeste: body.tipoTeste,
            resultadoTeste: body.resultadoTeste,
            efetividadeScore: body.efetividadeScore ?? null,
          },
        })
        return ok(reply, { id: result.id }, { message: 'Teste registrado' })
      } catch (err) {
        return replyError(reply, err)
      }
    },
  )

  server.post(
    '/controles/:id/riscos',
    {
      schema: {
        params: z.object({ id: z.coerce.number().int() }),
        body: z.object({
          riscoId: z.number().int(),
          papelControle: z.enum(['MITIGA', 'DETECTA', 'RECUPERA']),
          pesoMitigacao: z.number().int().min(1).max(10).default(1),
        }),
      },
    },
    async (request, reply) => {
      const ctx = await requireGrcAdmin(request, reply, useCases)
      if (!ctx) return
      try {
        const { id } = request.params as { id: number }
        const body = request.body as {
          riscoId: number
          papelControle: string
          pesoMitigacao: number
        }
        await useCases.associarControleRisco.execute({
          tenantId: ctx.tenantId,
          controleId: id,
          riscoId: body.riscoId,
          papelControle: body.papelControle,
          pesoMitigacao: body.pesoMitigacao,
        })
        return ok(reply, { ok: true }, { message: 'Vínculo criado' })
      } catch (err) {
        return replyError(reply, err)
      }
    },
  )

  // ── Auditorias ────────────────────────────────────────────────────────────

  server.get('/auditorias', async (request, reply) => {
    const ctx = await requireGrcAdmin(request, reply, useCases)
    if (!ctx) return
    try {
      const q = z
        .object({
          status: z.string().optional(),
          pagina: z.coerce.number().int().min(1).default(1),
          limite: z.coerce.number().int().min(1).max(100).default(30),
        })
        .parse(request.query || {})
      const { rows, total } = await useCases.listAuditorias.execute({
        tenantId: ctx.tenantId,
        status: q.status,
        pagina: q.pagina,
        limite: q.limite,
      })
      return ok(reply, rows, { meta: { pagina: q.pagina, limite: q.limite, total } })
    } catch (err) {
      return replyError(reply, err)
    }
  })

  server.post(
    '/auditorias',
    {
      schema: {
        body: z.object({
          codigo: z.string().min(2),
          nome: z.string().min(2),
          tipoAuditoria: z
            .enum(['INTERNA', 'TEMATICA', 'FORENSE', 'COMPLIANCE', 'OPERACIONAL', 'TERCEIROS'])
            .default('INTERNA'),
          statusAuditoria: z.string().default('PLANEJADA'),
          escopoDescricao: z.string().optional().nullable(),
          auditorLiderUserId: z.number().int().optional().nullable(),
          dataInicioPlanejada: z.string().optional().nullable(),
          dataFimPlanejada: z.string().optional().nullable(),
        }),
      },
    },
    async (request, reply) => {
      const ctx = await requireGrcAdmin(request, reply, useCases)
      if (!ctx) return
      try {
        const body = request.body as {
          codigo: string
          nome: string
          tipoAuditoria: string
          statusAuditoria: string
          escopoDescricao?: string | null
          auditorLiderUserId?: number | null
          dataInicioPlanejada?: string | null
          dataFimPlanejada?: string | null
        }
        const result = await useCases.createAuditoria.execute({
          tenantId: ctx.tenantId,
          userId: ctx.userId,
          codigo: body.codigo,
          nome: body.nome,
          tipoAuditoria: body.tipoAuditoria,
          statusAuditoria: body.statusAuditoria,
          escopoDescricao: body.escopoDescricao,
          auditorLiderUserId: body.auditorLiderUserId,
          dataInicioPlanejada: body.dataInicioPlanejada ? new Date(body.dataInicioPlanejada) : null,
          dataFimPlanejada: body.dataFimPlanejada ? new Date(body.dataFimPlanejada) : null,
        })
        return ok(reply, { id: result.id }, { message: 'Auditoria criada' })
      } catch (err) {
        return replyError(reply, err)
      }
    },
  )

  server.post('/auditorias/:id/encerrar', async (request, reply) => {
    const ctx = await requireGrcAdmin(request, reply, useCases)
    if (!ctx) return
    try {
      const { id } = z.object({ id: z.coerce.number().int() }).parse(request.params || {})
      const body = z
        .object({
          opiniaoFinal: z.string().optional().nullable(),
          ratingFinal: z.string().optional().nullable(),
        })
        .parse((request.body as unknown) || {})
      await useCases.encerrarAuditoria.execute({
        id,
        tenantId: ctx.tenantId,
        opiniaoFinal: body.opiniaoFinal,
        ratingFinal: body.ratingFinal,
      })
      return ok(reply, { ok: true }, { message: 'Auditoria encerrada' })
    } catch (err) {
      return replyError(reply, err)
    }
  })

  // ── Achados ───────────────────────────────────────────────────────────────

  server.get('/achados', async (request, reply) => {
    const ctx = await requireGrcAdmin(request, reply, useCases)
    if (!ctx) return
    try {
      const q = z
        .object({
          status: z.string().optional(),
          gravidade: z.string().optional(),
          pagina: z.coerce.number().int().min(1).default(1),
          limite: z.coerce.number().int().min(1).max(100).default(30),
        })
        .parse(request.query || {})
      const { rows, total } = await useCases.listAchados.execute({
        tenantId: ctx.tenantId,
        status: q.status,
        gravidade: q.gravidade,
        pagina: q.pagina,
        limite: q.limite,
      })
      return ok(reply, rows, { meta: { pagina: q.pagina, limite: q.limite, total } })
    } catch (err) {
      return replyError(reply, err)
    }
  })

  server.post(
    '/achados',
    {
      schema: {
        body: z.object({
          auditoriaId: z.number().int().optional().nullable(),
          riscoId: z.number().int().optional().nullable(),
          controleId: z.number().int().optional().nullable(),
          incidenteId: z.number().int().optional().nullable(),
          criseId: z.number().int().optional().nullable(),
          titulo: z.string().min(2),
          descricao: z.string().optional().nullable(),
          gravidade: z.enum(['OBSERVACAO', 'BAIXA', 'MEDIA', 'ALTA', 'CRITICA']).default('MEDIA'),
          statusAchado: z
            .enum(['ABERTO', 'EM_TRATAMENTO', 'EM_VALIDACAO', 'ENCERRADO', 'ACEITO'])
            .default('ABERTO'),
          causaRaiz: z.string().optional().nullable(),
          impactoResumo: z.string().optional().nullable(),
          recomendacao: z.string().optional().nullable(),
          ownerUserId: z.number().int().optional().nullable(),
          prazoTratativaEm: z.string().optional().nullable(),
        }),
      },
    },
    async (request, reply) => {
      const ctx = await requireGrcAdmin(request, reply, useCases)
      if (!ctx) return
      try {
        const body = request.body as {
          auditoriaId?: number | null
          riscoId?: number | null
          controleId?: number | null
          incidenteId?: number | null
          criseId?: number | null
          titulo: string
          descricao?: string | null
          gravidade: string
          statusAchado: string
          causaRaiz?: string | null
          impactoResumo?: string | null
          recomendacao?: string | null
          ownerUserId?: number | null
          prazoTratativaEm?: string | null
        }
        const result = await useCases.createAchado.execute({
          tenantId: ctx.tenantId,
          userId: ctx.userId,
          ...body,
          prazoTratativaEm: body.prazoTratativaEm ? new Date(body.prazoTratativaEm) : null,
        })
        await emitObservabilityEvent({
          tenantId: ctx.tenantId,
          categoria: 'SECURITY',
          nomeEvento: 'grc.finding.created',
          severidade:
            body.gravidade === 'CRITICA' ? 'CRITICAL' : body.gravidade === 'ALTA' ? 'ERROR' : 'WARNING',
          resultado: 'SUCESSO',
          origemTipo: 'INTERNAL',
          modulo: 'GRC',
          entidadeTipo: 'GRC_ACHADO',
          entidadeId: result.id,
          actorUserId: ctx.userId,
          payload: { gravidade: body.gravidade, statusAchado: body.statusAchado },
        })
        return ok(reply, { id: result.id }, { message: 'Achado criado' })
      } catch (err) {
        return replyError(reply, err)
      }
    },
  )

  server.post('/achados/:id/encerrar', async (request, reply) => {
    const ctx = await requireGrcAdmin(request, reply, useCases)
    if (!ctx) return
    try {
      const { id } = z.object({ id: z.coerce.number().int() }).parse(request.params || {})
      await useCases.encerrarAchado.execute({ id, tenantId: ctx.tenantId })
      return ok(reply, { ok: true }, { message: 'Achado encerrado' })
    } catch (err) {
      return replyError(reply, err)
    }
  })

  // ── Planos de Ação ────────────────────────────────────────────────────────

  server.get('/planos-acao', async (request, reply) => {
    const ctx = await requireGrcAdmin(request, reply, useCases)
    if (!ctx) return
    try {
      const q = z
        .object({
          status: z.string().optional(),
          pagina: z.coerce.number().int().min(1).default(1),
          limite: z.coerce.number().int().min(1).max(100).default(30),
        })
        .parse(request.query || {})
      const { rows, total } = await useCases.listPlanosAcao.execute({
        tenantId: ctx.tenantId,
        status: q.status,
        pagina: q.pagina,
        limite: q.limite,
      })
      return ok(reply, rows, { meta: { pagina: q.pagina, limite: q.limite, total } })
    } catch (err) {
      return replyError(reply, err)
    }
  })

  server.post(
    '/planos-acao',
    {
      schema: {
        body: z.object({
          origemTipo: z.enum(['RISCO', 'ACHADO', 'INCIDENTE', 'CRISE', 'CONTROLE', 'AUDITORIA']),
          origemId: z.number().int(),
          titulo: z.string().min(2),
          descricao: z.string().optional().nullable(),
          criticidade: z.enum(['BAIXA', 'MEDIA', 'ALTA', 'CRITICA']).default('MEDIA'),
          ownerUserId: z.number().int().optional().nullable(),
          aprovadorUserId: z.number().int().optional().nullable(),
          dataLimite: z.string().optional().nullable(),
          resultadoEsperado: z.string().optional().nullable(),
          criterioAceite: z.string().optional().nullable(),
        }),
      },
    },
    async (request, reply) => {
      const ctx = await requireGrcAdmin(request, reply, useCases)
      if (!ctx) return
      try {
        const body = request.body as {
          origemTipo: string
          origemId: number
          titulo: string
          descricao?: string | null
          criticidade: string
          ownerUserId?: number | null
          aprovadorUserId?: number | null
          dataLimite?: string | null
          resultadoEsperado?: string | null
          criterioAceite?: string | null
        }
        const result = await useCases.createPlanoAcao.execute({
          tenantId: ctx.tenantId,
          userId: ctx.userId,
          ...body,
          dataLimite: body.dataLimite ? new Date(body.dataLimite) : null,
        })
        return ok(reply, { id: result.id }, { message: 'Plano de ação criado' })
      } catch (err) {
        return replyError(reply, err)
      }
    },
  )

  server.post('/planos-acao/:id/aprovar', async (request, reply) => {
    const ctx = await requireGrcAdmin(request, reply, useCases)
    if (!ctx) return
    try {
      const { id } = z.object({ id: z.coerce.number().int() }).parse(request.params || {})
      await useCases.aprovarPlanoAcao.execute({ id, tenantId: ctx.tenantId, userId: ctx.userId })
      return ok(reply, { ok: true }, { message: 'Plano aprovado' })
    } catch (err) {
      return replyError(reply, err)
    }
  })

  server.post('/planos-acao/:id/concluir', async (request, reply) => {
    const ctx = await requireGrcAdmin(request, reply, useCases)
    if (!ctx) return
    try {
      const { id } = z.object({ id: z.coerce.number().int() }).parse(request.params || {})
      await useCases.concluirPlanoAcao.execute({ id, tenantId: ctx.tenantId })
      return ok(reply, { ok: true }, { message: 'Plano concluído' })
    } catch (err) {
      return replyError(reply, err)
    }
  })

  // ── Evidências ────────────────────────────────────────────────────────────

  server.get('/evidencias', async (request, reply) => {
    const ctx = await requireGrcAdmin(request, reply, useCases)
    if (!ctx) return
    try {
      const q = z
        .object({
          referenciaTipo: z.string().optional(),
          referenciaId: z.coerce.number().int().optional(),
          pagina: z.coerce.number().int().min(1).default(1),
          limite: z.coerce.number().int().min(1).max(100).default(30),
        })
        .parse(request.query || {})
      const { rows, total } = await useCases.listEvidencias.execute({
        tenantId: ctx.tenantId,
        referenciaTipo: q.referenciaTipo,
        referenciaId: q.referenciaId,
        pagina: q.pagina,
        limite: q.limite,
      })
      return ok(reply, rows, { meta: { pagina: q.pagina, limite: q.limite, total } })
    } catch (err) {
      return replyError(reply, err)
    }
  })

  server.post(
    '/evidencias',
    {
      schema: {
        body: z.object({
          referenciaTipo: z.string().min(2),
          referenciaId: z.number().int(),
          tipoEvidencia: z.string().min(2),
          titulo: z.string().optional().nullable(),
          descricao: z.string().optional().nullable(),
          arquivoPath: z.string().optional().nullable(),
          hashSha256: z.string().optional().nullable(),
          metadataJson: z.unknown().optional().nullable(),
        }),
      },
    },
    async (request, reply) => {
      const ctx = await requireGrcAdmin(request, reply, useCases)
      if (!ctx) return
      try {
        const body = request.body as {
          referenciaTipo: string
          referenciaId: number
          tipoEvidencia: string
          titulo?: string | null
          descricao?: string | null
          arquivoPath?: string | null
          hashSha256?: string | null
          metadataJson?: unknown
        }
        const result = await useCases.createEvidencia.execute({
          tenantId: ctx.tenantId,
          userId: ctx.userId,
          ...body,
        })
        return ok(reply, { id: result.id }, { message: 'Evidência anexada' })
      } catch (err) {
        return replyError(reply, err)
      }
    },
  )
}

// Suppress unused-import warnings for domain error classes imported for consistency
void GrcForbiddenError
void GrcUnauthorizedError
