import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { makeObservabilidadeUseCases } from '@/modules/observabilidade/application/factories/makeObservabilidadeUseCases.js'
import { authenticate } from '@/utils/authenticate.js'

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
    return {
      tenantId: typeof tenantId === 'number' ? tenantId : null,
      userId,
      role: typeof role === 'string' ? role : 'SYSTEM_ADMIN',
      isSystemAdmin: true,
    } as const
  if (typeof tenantId !== 'number') return null
  return { tenantId, userId, role: typeof role === 'string' ? role : 'USER', isSystemAdmin: false } as const
}

export default async function observabilidadeRoutes(server: FastifyInstance) {
  server.addHook('onRequest', authenticate)

  const useCases = makeObservabilidadeUseCases()

  server.post(
    '/eventos',
    {
      schema: {
        body: z.object({
          categoria: z.string(),
          subcategoria: z.string().optional().nullable(),
          nomeEvento: z.string(),
          severidade: z.string().optional(),
          resultado: z.string().optional(),
          origemTipo: z.string().optional(),
          origemChave: z.string().optional().nullable(),
          modulo: z.string().optional().nullable(),
          entidadeTipo: z.string().optional().nullable(),
          entidadeId: z.number().int().optional().nullable(),
          actorTipo: z.string().optional().nullable(),
          actorUserId: z.number().int().optional().nullable(),
          actorEmail: z.string().optional().nullable(),
          targetTipo: z.string().optional().nullable(),
          targetId: z.number().int().optional().nullable(),
          requestId: z.string().optional().nullable(),
          correlationId: z.string().optional().nullable(),
          sessionId: z.string().optional().nullable(),
          traceId: z.string().optional().nullable(),
          ip: z.string().optional().nullable(),
          userAgent: z.string().optional().nullable(),
          rota: z.string().optional().nullable(),
          metodoHttp: z.string().optional().nullable(),
          statusHttp: z.number().int().optional().nullable(),
          payload: z.unknown().optional().nullable(),
          labelsJson: z.record(z.string(), z.string()).optional().nullable(),
          ocorridoEm: z.string().optional(),
        }),
      },
    },
    async (request, reply) => {
      const ctx = getAuthContext(request)
      if (!ctx) return fail(reply, 401, 'Não autenticado')
      if (ctx.isSystemAdmin) return fail(reply, 403, 'Tenant não selecionado')
      const body = request.body as Record<string, unknown>
      const result = await useCases.createEvento.execute({
        tenantId: ctx.tenantId,
        categoria: body.categoria as string,
        subcategoria: (body.subcategoria as string | null | undefined) ?? null,
        nomeEvento: body.nomeEvento as string,
        severidade: body.severidade as string | undefined,
        resultado: body.resultado as string | undefined,
        origemTipo: body.origemTipo as string | undefined,
        origemChave: (body.origemChave as string | null | undefined) ?? null,
        modulo: (body.modulo as string | null | undefined) ?? null,
        entidadeTipo: (body.entidadeTipo as string | null | undefined) ?? null,
        entidadeId: (body.entidadeId as number | null | undefined) ?? null,
        actorTipo: (body.actorTipo as string | null | undefined) ?? null,
        actorUserId: (body.actorUserId as number | null | undefined) ?? null,
        actorEmail: (body.actorEmail as string | null | undefined) ?? null,
        targetTipo: (body.targetTipo as string | null | undefined) ?? null,
        targetId: (body.targetId as number | null | undefined) ?? null,
        requestId: (body.requestId as string | null | undefined) ?? null,
        correlationId: (body.correlationId as string | null | undefined) ?? null,
        sessionId: (body.sessionId as string | null | undefined) ?? null,
        traceId: (body.traceId as string | null | undefined) ?? null,
        ip: (body.ip as string | null | undefined) ?? null,
        userAgent: (body.userAgent as string | null | undefined) ?? null,
        rota: (body.rota as string | null | undefined) ?? null,
        metodoHttp: (body.metodoHttp as string | null | undefined) ?? null,
        statusHttp: (body.statusHttp as number | null | undefined) ?? null,
        payload: body.payload,
        labelsJson: (body.labelsJson as Record<string, string> | null | undefined) ?? null,
        ocorridoEm: body.ocorridoEm as string | undefined,
      })
      return ok(reply, result, { message: 'Evento registrado' })
    },
  )

  server.get('/eventos', async (request, reply) => {
    const ctx = getAuthContext(request)
    if (!ctx) return fail(reply, 401, 'Não autenticado')
    if (ctx.isSystemAdmin) return fail(reply, 403, 'Tenant não selecionado')
    const q = z
      .object({
        pagina: z.coerce.number().int().min(1).default(1),
        limite: z.coerce.number().int().min(1).max(100).default(30),
        categoria: z.string().optional(),
        severidade: z.string().optional(),
        resultado: z.string().optional(),
        origemTipo: z.string().optional(),
        texto: z.string().optional(),
        desde: z.string().optional(),
        ate: z.string().optional(),
      })
      .parse(request.query || {})
    const { rows, total } = await useCases.listEventos.execute(ctx.tenantId, q)
    const data = (rows as Record<string, unknown>[]).map((r) => ({
      id: r.id,
      eventId: r.eventId,
      tenantId: r.tenantId,
      categoria: r.categoria,
      subcategoria: r.subcategoria,
      nomeEvento: r.nomeEvento,
      severidade: r.severidade,
      resultado: r.resultado,
      origemTipo: r.origemTipo,
      origemChave: r.origemChave,
      modulo: r.modulo,
      entidadeTipo: r.entidadeTipo,
      entidadeId: r.entidadeId,
      actorTipo: r.actorTipo,
      actorUserId: r.actorUserId,
      actorEmail: r.actorEmail,
      targetTipo: r.targetTipo,
      targetId: r.targetId,
      requestId: r.requestId,
      correlationId: r.correlationId,
      sessionId: r.sessionId,
      traceId: r.traceId,
      ip: r.ip,
      userAgent: r.userAgent,
      rota: r.rota,
      metodoHttp: r.metodoHttp,
      statusHttp: r.statusHttp,
      payloadRedacted: r.payloadRedactedJson,
      labels: r.labelsJson,
      ocorridoEm: (r.ocorridoEm as Date).toISOString(),
    }))
    return ok(reply, data, { meta: { pagina: q.pagina, limite: q.limite, total } })
  })

  server.get('/eventos/:id', async (request, reply) => {
    const ctx = getAuthContext(request)
    if (!ctx) return fail(reply, 401, 'Não autenticado')
    if (ctx.isSystemAdmin) return fail(reply, 403, 'Tenant não selecionado')
    const { id } = z.object({ id: z.coerce.number().int() }).parse(request.params || {})
    const ev = await useCases.getEventoById.execute(ctx.tenantId, id)
    if (!ev) return fail(reply, 404, 'Evento não encontrado')
    const r = ev as Record<string, unknown>
    return ok(reply, {
      id: r.id,
      eventId: r.eventId,
      tenantId: r.tenantId,
      categoria: r.categoria,
      subcategoria: r.subcategoria,
      nomeEvento: r.nomeEvento,
      severidade: r.severidade,
      resultado: r.resultado,
      origemTipo: r.origemTipo,
      origemChave: r.origemChave,
      modulo: r.modulo,
      entidadeTipo: r.entidadeTipo,
      entidadeId: r.entidadeId,
      actorTipo: r.actorTipo,
      actorUserId: r.actorUserId,
      actorEmail: r.actorEmail,
      targetTipo: r.targetTipo,
      targetId: r.targetId,
      requestId: r.requestId,
      correlationId: r.correlationId,
      sessionId: r.sessionId,
      traceId: r.traceId,
      ip: r.ip,
      userAgent: r.userAgent,
      rota: r.rota,
      metodoHttp: r.metodoHttp,
      statusHttp: r.statusHttp,
      payloadRedacted: r.payloadRedactedJson,
      labels: r.labelsJson,
      ocorridoEm: (r.ocorridoEm as Date).toISOString(),
    })
  })

  server.get('/alertas', async (request, reply) => {
    const ctx = getAuthContext(request)
    if (!ctx) return fail(reply, 401, 'Não autenticado')
    if (ctx.isSystemAdmin) return fail(reply, 403, 'Tenant não selecionado')
    const q = z
      .object({
        status: z.string().optional(),
        pagina: z.coerce.number().int().min(1).default(1),
        limite: z.coerce.number().int().min(1).max(100).default(30),
      })
      .parse(request.query || {})
    const { rows, total } = await useCases.listAlertas.execute(ctx.tenantId, q)
    return ok(reply, rows, { meta: { pagina: q.pagina, limite: q.limite, total } })
  })

  server.get('/incidentes', async (request, reply) => {
    const ctx = getAuthContext(request)
    if (!ctx) return fail(reply, 401, 'Não autenticado')
    if (ctx.isSystemAdmin) return fail(reply, 403, 'Tenant não selecionado')
    const q = z
      .object({
        status: z.string().optional(),
        pagina: z.coerce.number().int().min(1).default(1),
        limite: z.coerce.number().int().min(1).max(100).default(30),
      })
      .parse(request.query || {})
    const { rows, total } = await useCases.listIncidentes.execute(ctx.tenantId, q)
    return ok(reply, rows, { meta: { pagina: q.pagina, limite: q.limite, total } })
  })

  server.get('/incidentes/:id', async (request, reply) => {
    const ctx = getAuthContext(request)
    if (!ctx) return fail(reply, 401, 'Não autenticado')
    if (ctx.isSystemAdmin) return fail(reply, 403, 'Tenant não selecionado')
    const { id } = z.object({ id: z.coerce.number().int() }).parse(request.params || {})
    const inc = await useCases.getIncidenteById.execute(ctx.tenantId, id)
    if (!inc) return fail(reply, 404, 'Incidente não encontrado')
    return ok(reply, inc)
  })

  server.get('/regras', async (request, reply) => {
    const ctx = getAuthContext(request)
    if (!ctx) return fail(reply, 401, 'Não autenticado')
    if (ctx.isSystemAdmin) return fail(reply, 403, 'Tenant não selecionado')
    const q = z
      .object({
        ativo: z.string().optional(),
        pagina: z.coerce.number().int().min(1).default(1),
        limite: z.coerce.number().int().min(1).max(100).default(30),
      })
      .parse(request.query || {})
    const { rows, total } = await useCases.listRegras.execute(ctx.tenantId, q)
    return ok(reply, rows, { meta: { pagina: q.pagina, limite: q.limite, total } })
  })
}
