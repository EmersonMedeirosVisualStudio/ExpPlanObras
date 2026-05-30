import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { makeContinuidadeUseCases } from '@/modules/continuidade/application/factories/makeContinuidadeUseCases.js'
import { authenticate } from '@/utils/authenticate.js'
import { calcularReadinessPlano } from '@/modules/continuidade/readiness.js'
import { replyError } from '@/shared/errors/HttpError.js'
import { emitObservabilityEvent } from '@/modules/observabilidade/emit.js'

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
    return { tenantId: typeof tenantId === 'number' ? tenantId : null, userId, role: typeof role === 'string' ? role : 'SYSTEM_ADMIN', isSystemAdmin: true } as const
  if (typeof tenantId !== 'number') return null
  return { tenantId, userId, role: typeof role === 'string' ? role : 'USER', isSystemAdmin: false } as const
}

async function requireTenant(request: FastifyRequest, reply: FastifyReply) {
  const ctx = getAuthContext(request)
  if (!ctx) return fail(reply, 401, 'Não autenticado')
  if (ctx.isSystemAdmin) return fail(reply, 403, 'Tenant não selecionado')
  return ctx
}

export default async function continuidadeRoutes(server: FastifyInstance) {
  server.addHook('onRequest', authenticate)

  const uc = makeContinuidadeUseCases()

  server.get('/planos', async (request, reply) => {
    const ctx = await requireTenant(request, reply)
    if (!ctx || (ctx as unknown as { success: boolean }).success === false) return
    const q = z
      .object({
        tipo: z.string().optional(),
        ativo: z.string().optional(),
        pagina: z.coerce.number().int().min(1).default(1),
        limite: z.coerce.number().int().min(1).max(100).default(30),
      })
      .parse(request.query || {})
    const result = await uc.listBcpPlanos.execute(ctx.tenantId, q)
    return ok(reply, result.rows, { meta: { pagina: q.pagina, limite: q.limite, total: result.total } })
  })

  server.post(
    '/planos',
    {
      schema: {
        body: z.object({
          codigo: z.string().min(2),
          nome: z.string().min(2),
          descricao: z.string().optional().nullable(),
          tipoPlano: z.enum(['BCP', 'DR', 'CRISE']),
          modulo: z.string().optional().nullable(),
          criticidade: z.enum(['BAIXA', 'MEDIA', 'ALTA', 'CRITICA']).default('MEDIA'),
          rtoMinutos: z.number().int().min(1),
          rpoMinutos: z.number().int().min(0),
        }),
      },
    },
    async (request, reply) => {
      const ctx = await requireTenant(request, reply)
      if (!ctx || (ctx as unknown as { success: boolean }).success === false) return
      try {
        const body = request.body as Parameters<typeof uc.createBcpPlano.execute>[1]
        const created = await uc.createBcpPlano.execute(ctx.tenantId, body, ctx.userId)
        await emitObservabilityEvent({
          tenantId: ctx.tenantId,
          categoria: 'SISTEMA',
          nomeEvento: 'bcp.plan.created',
          severidade: 'INFO',
          resultado: 'SUCESSO',
          origemTipo: 'INTERNAL',
          modulo: 'BCP',
          entidadeTipo: 'BCP_PLANO',
          entidadeId: (created as { id: number }).id,
          actorUserId: ctx.userId,
          payload: { codigo: (created as { codigo: string }).codigo, tipoPlano: (created as { tipoPlano: string }).tipoPlano },
        })
        return ok(reply, { id: (created as { id: number }).id }, { message: 'Plano criado' })
      } catch (e) { return replyError(reply, e) }
    }
  )

  server.get('/planos/:id', async (request, reply) => {
    const ctx = await requireTenant(request, reply)
    if (!ctx || (ctx as unknown as { success: boolean }).success === false) return
    const { id } = z.object({ id: z.coerce.number().int() }).parse(request.params || {})
    try {
      const p = await uc.getBcpPlanoById.execute(ctx.tenantId, id)
      if (!p) return fail(reply, 404, 'Plano não encontrado')
      return ok(reply, p)
    } catch (e) { return replyError(reply, e) }
  })

  server.get('/planos/:id/readiness', async (request, reply) => {
    const ctx = await requireTenant(request, reply)
    if (!ctx || (ctx as unknown as { success: boolean }).success === false) return
    const { id } = z.object({ id: z.coerce.number().int() }).parse(request.params || {})
    const res = await calcularReadinessPlano({ tenantId: ctx.tenantId, planoId: id, repo: uc.repo })
    if (!res.ok) return fail(reply, 404, 'Plano não encontrado')
    return ok(reply, { score: res.score, class: res.class, componentes: res.componentes })
  })

  server.get('/dr/execucoes', async (request, reply) => {
    const ctx = await requireTenant(request, reply)
    if (!ctx || (ctx as unknown as { success: boolean }).success === false) return
    const q = z
      .object({
        status: z.string().optional(),
        pagina: z.coerce.number().int().min(1).default(1),
        limite: z.coerce.number().int().min(1).max(100).default(30),
      })
      .parse(request.query || {})
    const result = await uc.listDrExecucoes.execute(ctx.tenantId, q)
    return ok(reply, result.rows, { meta: { pagina: q.pagina, limite: q.limite, total: result.total } })
  })

  server.post(
    '/dr/execucoes',
    {
      schema: {
        body: z.object({
          planoId: z.number().int(),
          origemTipo: z.string().min(2),
          referenciaOrigem: z.string().optional().nullable(),
          tipoRecuperacao: z.enum(['RESTORE_TOTAL', 'RESTORE_PARCIAL', 'VALIDACAO_RESTORE', 'FAILOVER', 'ROLLBACK']),
          aprovacaoExigida: z.boolean().optional().default(false),
        }),
      },
    },
    async (request, reply) => {
      const ctx = await requireTenant(request, reply)
      if (!ctx || (ctx as unknown as { success: boolean }).success === false) return
      try {
        const body = request.body as Parameters<typeof uc.createDrExecucao.execute>[1]
        const created = await uc.createDrExecucao.execute(ctx.tenantId, body)
        await emitObservabilityEvent({
          tenantId: ctx.tenantId,
          categoria: 'SISTEMA',
          nomeEvento: 'dr.recovery.started',
          severidade: 'INFO',
          resultado: 'SUCESSO',
          origemTipo: 'INTERNAL',
          modulo: 'DR',
          entidadeTipo: 'DR_EXECUCAO',
          entidadeId: (created as { id: number }).id,
          actorUserId: ctx.userId,
          payload: { planoId: body.planoId },
        })
        return ok(reply, { id: (created as { id: number }).id }, { message: 'Execução iniciada' })
      } catch (e) { return replyError(reply, e) }
    }
  )

  server.post('/dr/execucoes/:id/aprovar', async (request, reply) => {
    const ctx = await requireTenant(request, reply)
    if (!ctx || (ctx as unknown as { success: boolean }).success === false) return
    const { id } = z.object({ id: z.coerce.number().int() }).parse(request.params || {})
    try {
      await uc.approveDrExecucao.execute(ctx.tenantId, id, ctx.userId)
      return ok(reply, { ok: true }, { message: 'Aprovado' })
    } catch (e) { return replyError(reply, e) }
  })

  server.post(
    '/dr/execucoes/:id/concluir',
    {
      schema: {
        params: z.object({ id: z.coerce.number().int() }),
        body: z.object({
          sucesso: z.boolean().default(true),
          rtoRealMinutos: z.number().int().optional().nullable(),
          rpoRealMinutos: z.number().int().optional().nullable(),
          resultadoResumoJson: z.unknown().optional().nullable(),
        }),
      },
    },
    async (request, reply) => {
      const ctx = await requireTenant(request, reply)
      if (!ctx || (ctx as unknown as { success: boolean }).success === false) return
      const { id } = request.params as { id: number }
      try {
        const body = request.body as Parameters<typeof uc.concludeDrExecucao.execute>[2]
        await uc.concludeDrExecucao.execute(ctx.tenantId, id, body)
        return ok(reply, { ok: true }, { message: 'Execução concluída' })
      } catch (e) { return replyError(reply, e) }
    }
  )

  server.get('/crises', async (request, reply) => {
    const ctx = await requireTenant(request, reply)
    if (!ctx || (ctx as unknown as { success: boolean }).success === false) return
    const q = z
      .object({
        status: z.string().optional(),
        pagina: z.coerce.number().int().min(1).default(1),
        limite: z.coerce.number().int().min(1).max(100).default(30),
      })
      .parse(request.query || {})
    const result = await uc.listCrises.execute(ctx.tenantId, q)
    return ok(reply, result.rows, { meta: { pagina: q.pagina, limite: q.limite, total: result.total } })
  })

  server.post(
    '/crises',
    {
      schema: {
        body: z.object({
          codigo: z.string().min(2),
          titulo: z.string().min(2),
          descricao: z.string().optional().nullable(),
          tipoCrise: z.string().min(2),
          severidade: z.enum(['BAIXA', 'MEDIA', 'ALTA', 'CRITICA']).default('ALTA'),
          incidenteOrigemId: z.number().int().optional().nullable(),
          planoAcionadoId: z.number().int().optional().nullable(),
        }),
      },
    },
    async (request, reply) => {
      const ctx = await requireTenant(request, reply)
      if (!ctx || (ctx as unknown as { success: boolean }).success === false) return
      try {
        const body = request.body as Parameters<typeof uc.createCriseRegistro.execute>[1]
        const created = await uc.createCriseRegistro.execute(ctx.tenantId, body, ctx.userId)
        await emitObservabilityEvent({
          tenantId: ctx.tenantId,
          categoria: 'SECURITY',
          nomeEvento: 'crisis.opened',
          severidade: 'CRITICAL',
          resultado: 'SUCESSO',
          origemTipo: 'INTERNAL',
          modulo: 'CRISIS',
          entidadeTipo: 'CRISE',
          entidadeId: (created as { id: number }).id,
          actorUserId: ctx.userId,
          payload: { codigo: (created as { codigo: string }).codigo, severidade: (created as { severidade: string }).severidade },
        })
        return ok(reply, { id: (created as { id: number }).id }, { message: 'Crise aberta' })
      } catch (e) { return replyError(reply, e) }
    }
  )
}
