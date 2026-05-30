import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { makeSecurityFieldsUseCases } from '@/application/contracts/makeSecurityFieldsUseCases.js'
import { getCatalogForResource } from '@/infra/providers/security-fields/catalog.js'
import { PolicyNotFoundError } from '@/domain/errors/SecurityFieldsErrors.js'
import { evaluateFieldDecision, loadSubjectContext } from '@/infra/providers/security-fields/service.js'
import { sanitizeResourceObject } from '@/infra/providers/security-fields/sanitizer.js'
import { replyError } from '@/shared/errors/HttpError.js'
import { authenticate } from '@/shared/utils/authenticate.js'

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

async function requireSecurityAdmin(
  request: FastifyRequest,
  reply: FastifyReply,
  repo: ReturnType<typeof makeSecurityFieldsUseCases>['repo'],
): Promise<(AuthCtx & { tenantId: number }) | null> {
  const ctx = getAuthContext(request)
  if (!ctx) {
    fail(reply, 401, 'Não autenticado')
    return null
  }

  if (ctx.isSystemAdmin) {
    if (ctx.tenantId == null) {
      fail(reply, 403, 'Tenant não selecionado')
      return null
    }
    return { ...ctx, tenantId: ctx.tenantId }
  }

  const tenantUser = await repo.findTenantUser({ tenantId: ctx.tenantId, userId: ctx.userId })
  if (!tenantUser) {
    fail(reply, 403, 'Tenant não selecionado')
    return null
  }
  if (tenantUser.role === 'ADMIN') return ctx as AuthCtx & { tenantId: number }

  const enc = await repo.findSystemEncarregado(ctx.tenantId)
  if (enc?.userId === ctx.userId) return ctx as AuthCtx & { tenantId: number }

  fail(reply, 403, 'Acesso negado')
  return null
}

export default async function securityFieldsRoutes(server: FastifyInstance) {
  const { listPolicies, createPolicy, updatePolicy, listAuditLogs, repo } =
    makeSecurityFieldsUseCases()

  server.addHook('onRequest', authenticate)

  // ── GET /policies ──────────────────────────────────────────────────────────

  server.get('/policies', async (request, reply) => {
    const ctx = await requireSecurityAdmin(request, reply, repo)
    if (!ctx) return

    const query = z
      .object({
        recurso: z.string().optional(),
        acao: z.string().optional(),
        ativo: z.enum(['true', 'false']).optional(),
        pagina: z.coerce.number().int().min(1).default(1),
        limite: z.coerce.number().int().min(1).max(100).default(50),
      })
      .parse(request.query || {})

    const filter = {
      recurso: query.recurso,
      acao: query.acao,
      ativo: query.ativo === 'true' ? true : query.ativo === 'false' ? false : undefined,
      pagina: query.pagina,
      limite: query.limite,
    }

    const { rows, total } = await listPolicies.execute(ctx.tenantId, filter)
    return ok(reply, rows, { meta: { pagina: query.pagina, limite: query.limite, total } })
  })

  // ── POST /policies ─────────────────────────────────────────────────────────

  server.post(
    '/policies',
    {
      schema: {
        body: z.object({
          recurso: z.string().min(2),
          acao: z.string().min(2),
          caminhoCampo: z.string().min(1),
          efeitoCampo: z.enum(['ALLOW', 'MASK', 'HIDE', 'NULLIFY', 'TRANSFORM']),
          estrategiaMascara: z.string().optional().nullable(),
          prioridade: z.number().int().min(0).max(1000).default(0),
          condicaoJson: z.unknown().optional().nullable(),
          ativo: z.boolean().default(true),
          alvos: z
            .array(
              z.object({
                tipoAlvo: z.enum(['TODOS', 'USUARIO', 'PERFIL', 'PERMISSAO', 'ROLE']),
                userId: z.number().int().optional().nullable(),
                perfilCodigo: z.string().optional().nullable(),
                permissao: z.string().optional().nullable(),
                ativo: z.boolean().default(true),
              }),
            )
            .default([]),
        }),
      },
    },
    async (request, reply) => {
      const ctx = await requireSecurityAdmin(request, reply, repo)
      if (!ctx) return

      const body = request.body as {
        recurso: string
        acao: string
        caminhoCampo: string
        efeitoCampo: string
        estrategiaMascara?: string | null
        prioridade: number
        condicaoJson?: unknown | null
        ativo: boolean
        alvos: Array<{
          tipoAlvo: string
          userId?: number | null
          perfilCodigo?: string | null
          permissao?: string | null
          ativo: boolean
        }>
      }

      try {
        const created = await createPolicy.execute(ctx.tenantId, {
          recurso: body.recurso,
          acao: body.acao,
          caminhoCampo: body.caminhoCampo,
          efeitoCampo: body.efeitoCampo,
          estrategiaMascara: body.estrategiaMascara ?? null,
          prioridade: body.prioridade ?? 0,
          condicaoJson: body.condicaoJson ?? null,
          ativo: body.ativo !== false,
          criadoPorUserId: ctx.userId,
          atualizadoPorUserId: ctx.userId,
          alvos: body.alvos ?? [],
        })
        return ok(reply, created, { message: 'Política criada' })
      } catch (err) {
        return replyError(reply, err)
      }
    },
  )

  // ── PUT /policies/:id ──────────────────────────────────────────────────────

  server.put(
    '/policies/:id',
    {
      schema: {
        params: z.object({ id: z.coerce.number().int() }),
        body: z.object({
          recurso: z.string().min(2),
          acao: z.string().min(2),
          caminhoCampo: z.string().min(1),
          efeitoCampo: z.enum(['ALLOW', 'MASK', 'HIDE', 'NULLIFY', 'TRANSFORM']),
          estrategiaMascara: z.string().optional().nullable(),
          prioridade: z.number().int().min(0).max(1000).default(0),
          condicaoJson: z.unknown().optional().nullable(),
          ativo: z.boolean().default(true),
          alvos: z
            .array(
              z.object({
                tipoAlvo: z.enum(['TODOS', 'USUARIO', 'PERFIL', 'PERMISSAO', 'ROLE']),
                userId: z.number().int().optional().nullable(),
                perfilCodigo: z.string().optional().nullable(),
                permissao: z.string().optional().nullable(),
                ativo: z.boolean().default(true),
              }),
            )
            .default([]),
        }),
      },
    },
    async (request, reply) => {
      const ctx = await requireSecurityAdmin(request, reply, repo)
      if (!ctx) return

      const { id } = request.params as { id: number }
      const body = request.body as {
        recurso: string
        acao: string
        caminhoCampo: string
        efeitoCampo: string
        estrategiaMascara?: string | null
        prioridade: number
        condicaoJson?: unknown | null
        ativo: boolean
        alvos: Array<{
          tipoAlvo: string
          userId?: number | null
          perfilCodigo?: string | null
          permissao?: string | null
          ativo: boolean
        }>
      }

      try {
        const updated = await updatePolicy.execute(ctx.tenantId, id, {
          recurso: body.recurso,
          acao: body.acao,
          caminhoCampo: body.caminhoCampo,
          efeitoCampo: body.efeitoCampo,
          estrategiaMascara: body.estrategiaMascara ?? null,
          prioridade: body.prioridade ?? 0,
          condicaoJson: body.condicaoJson ?? null,
          ativo: body.ativo !== false,
          atualizadoPorUserId: ctx.userId,
          alvos: body.alvos ?? [],
        })
        return ok(reply, updated, { message: 'Política atualizada' })
      } catch (err) {
        if (err instanceof PolicyNotFoundError) return fail(reply, 404, 'Política não encontrada')
        return replyError(reply, err)
      }
    },
  )

  // ── POST /simulate ─────────────────────────────────────────────────────────

  server.post(
    '/simulate',
    {
      schema: {
        body: z.object({
          userId: z.number().int().optional().nullable(),
          resource: z.string().min(2),
          action: z.enum(['VIEW', 'EXPORT', 'SEARCH', 'ANALYTICS']),
          entityId: z.number().int().optional().nullable(),
          sample: z.unknown(),
        }),
      },
    },
    async (request, reply) => {
      const ctx = await requireSecurityAdmin(request, reply, repo)
      if (!ctx) return

      const body = request.body as {
        userId?: number | null
        resource: string
        action: 'VIEW' | 'EXPORT' | 'SEARCH' | 'ANALYTICS'
        entityId?: number | null
        sample: unknown
      }

      const userId = typeof body.userId === 'number' ? body.userId : ctx.userId
      const subject = await loadSubjectContext({ tenantId: ctx.tenantId, userId })

      const catalog = getCatalogForResource(String(body.resource))
      const fields: Record<string, unknown> = {}

      for (const entry of catalog) {
        const fallback = {
          effect: entry.defaultEffect ?? 'ALLOW',
          strategy: entry.defaultMaskStrategy ?? null,
          reason: 'CATALOG_DEFAULT',
          policyId: null,
        }
        const decision = await evaluateFieldDecision({
          subject,
          resource: String(body.resource),
          action: body.action,
          path: entry.path,
          fallback,
        })
        fields[entry.path] = decision
      }

      const preview = await sanitizeResourceObject(
        body.sample,
        {
          tenantId: ctx.tenantId,
          userId,
          resource: body.resource,
          action: body.action,
          entityId: body.entityId ?? null,
          exportacao: body.action === 'EXPORT',
        },
        subject,
      )

      return ok(reply, { fields, preview })
    },
  )

  // ── GET /audit ─────────────────────────────────────────────────────────────

  server.get('/audit', async (request, reply) => {
    const ctx = await requireSecurityAdmin(request, reply, repo)
    if (!ctx) return

    const query = z
      .object({
        recurso: z.string().optional(),
        acao: z.string().optional(),
        userId: z.coerce.number().int().optional(),
        pagina: z.coerce.number().int().min(1).default(1),
        limite: z.coerce.number().int().min(1).max(100).default(50),
      })
      .parse(request.query || {})

    const { rows, total } = await listAuditLogs.execute(ctx.tenantId, {
      recurso: query.recurso,
      acao: query.acao,
      userId: query.userId,
      pagina: query.pagina,
      limite: query.limite,
    })

    return ok(reply, rows, { meta: { pagina: query.pagina, limite: query.limite, total } })
  })
}
