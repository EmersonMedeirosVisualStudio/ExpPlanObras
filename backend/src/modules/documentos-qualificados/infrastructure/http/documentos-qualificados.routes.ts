import type { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { makeDocumentosQualificadosUseCases } from '@/modules/documentos-qualificados/application/factories/makeDocumentosQualificadosUseCases.js'
import {
  AccessDeniedError,
  TenantNotSelectedError,
} from '@/modules/documentos-qualificados/domain/errors/DocumentosQualificadosErrors.js'
import { replyError } from '@/shared/errors/HttpError.js'
import { authenticate } from '@/shared/middleware/authenticate.js'

// ─── Auth context helpers ────────────────────────────────────────────────────

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
  if (isSystemAdmin) {
    return {
      tenantId: typeof tenantId === 'number' ? tenantId : null,
      userId,
      role: typeof role === 'string' ? role : 'SYSTEM_ADMIN',
      isSystemAdmin: true,
    } as const
  }
  if (typeof tenantId !== 'number') return null
  return {
    tenantId,
    userId,
    role: typeof role === 'string' ? role : 'USER',
    isSystemAdmin: false,
  } as const
}

function requireTenant(request: FastifyRequest): { tenantId: number; userId: number; role: string } {
  const ctx = getAuthContext(request)
  if (!ctx) throw new TenantNotSelectedError()
  if (ctx.isSystemAdmin) {
    if (ctx.tenantId == null) throw new TenantNotSelectedError()
    return { tenantId: ctx.tenantId, userId: ctx.userId, role: ctx.role }
  }
  return { tenantId: ctx.tenantId, userId: ctx.userId, role: ctx.role }
}

// ─── Zod schemas ─────────────────────────────────────────────────────────────

const idParam = z.object({ id: z.coerce.number().int().positive() })

const provedorBody = z.object({
  nome: z.string().min(2),
  codigo: z.string().min(2),
  tipo: z.enum(['ICP_QUALIFICADA', 'AVANCADA']),
  ambiente: z.enum(['SANDBOX', 'PRODUCAO']).default('SANDBOX'),
  baseUrl: z.string().min(8),
  clientId: z.string().optional().nullable(),
  clientSecret: z.string().optional().nullable(),
  apiKey: z.string().optional().nullable(),
  configuracaoJson: z.unknown().optional().nullable(),
  ativo: z.boolean().default(true),
})

const solicitacaoBody = z.object({
  documentoId: z.number().int(),
  versaoId: z.number().int().optional().nullable(),
  provedorId: z.number().int(),
  tipoAssinatura: z.enum(['QUALIFICADA_ICP_BRASIL', 'AVANCADA_EXTERNA']),
  exigeTodosSignatarios: z.boolean().default(true),
  signatarios: z
    .array(
      z.object({
        ordemAssinatura: z.number().int().min(1),
        tipoSignatario: z.enum(['USUARIO', 'FUNCIONARIO', 'EXTERNO']),
        userId: z.number().int().optional().nullable(),
        nome: z.string().min(2),
        email: z.string().email(),
        documento: z.string().optional().nullable(),
        papel: z.string().min(2).default('SIGNER'),
        obrigatorio: z.boolean().default(true),
      }),
    )
    .min(1),
  expiraEm: z.string().optional().nullable(),
  metadataJson: z.unknown().optional().nullable(),
})

const listSolicitacoesQuery = z.object({
  status: z.string().optional(),
  pagina: z.coerce.number().int().min(1).default(1),
  limite: z.coerce.number().int().min(1).max(100).default(30),
})

// ─── Route plugin ─────────────────────────────────────────────────────────────

export default async function documentosQualificadosRoutes(server: FastifyInstance) {
  const {
    checkAdminOrEncarregado,
    listProvedores,
    createProvedor,
    createSolicitacao,
    listSolicitacoes,
    getSolicitacaoById,
    enviarSolicitacao,
    sincronizarSolicitacao,
    cancelarSolicitacao,
    listArtefatos,
    verificarAssinatura,
    createCallback,
  } = makeDocumentosQualificadosUseCases()

  server.addHook('onRequest', authenticate)

  // ── Provedores ───────────────────────────────────────────────────────────

  server.get('/provedores', async (request, reply) => {
    try {
      const ctx = await checkAdminOrEncarregado.execute(getAuthContext(request) ?? { isSystemAdmin: false, tenantId: null as unknown as number, userId: -1, role: '' })
      const rows = await listProvedores.execute(ctx.tenantId)
      return reply.send({
        success: true,
        data: rows.map((r) => ({
          ...r,
          createdAt: r.createdAt.toISOString(),
          updatedAt: r.updatedAt.toISOString(),
        })),
      })
    } catch (e) {
      return replyError(reply, e)
    }
  })

  server.post(
    '/provedores',
    { schema: { body: provedorBody } },
    async (request, reply) => {
      try {
        const ctx = await checkAdminOrEncarregado.execute(
          getAuthContext(request) ?? { isSystemAdmin: false, tenantId: null as unknown as number, userId: -1, role: '' },
        )
        const body = request.body as z.infer<typeof provedorBody>
        const result = await createProvedor.execute(ctx.tenantId, body)
        return reply.send({ success: true, message: 'Provedor criado', data: result })
      } catch (e) {
        return replyError(reply, e)
      }
    },
  )

  // ── Solicitações ─────────────────────────────────────────────────────────

  server.post(
    '/solicitacoes',
    { schema: { body: solicitacaoBody } },
    async (request, reply) => {
      try {
        const ctx = requireTenant(request)
        if (getAuthContext(request)?.isSystemAdmin) throw new AccessDeniedError()
        const body = request.body as z.infer<typeof solicitacaoBody>
        const result = await createSolicitacao.execute(ctx.tenantId, ctx.userId, {
          documentoId: body.documentoId,
          versaoId: body.versaoId ?? null,
          provedorId: body.provedorId,
          tipoAssinatura: body.tipoAssinatura,
          exigeTodosSignatarios: body.exigeTodosSignatarios,
          signatarios: body.signatarios,
          expiraEm: body.expiraEm ?? null,
          metadataJson: body.metadataJson ?? null,
        })
        return reply.send({ success: true, message: 'Solicitação criada', data: result })
      } catch (e) {
        return replyError(reply, e)
      }
    },
  )

  server.get(
    '/solicitacoes',
    { schema: { querystring: listSolicitacoesQuery } },
    async (request, reply) => {
      try {
        const ctx = requireTenant(request)
        if (getAuthContext(request)?.isSystemAdmin) throw new AccessDeniedError()
        const q = request.query as z.infer<typeof listSolicitacoesQuery>
        const { rows, total } = await listSolicitacoes.execute(ctx.tenantId, {
          status: q.status,
          pagina: q.pagina,
          limite: q.limite,
        })
        return reply.send({
          success: true,
          data: rows.map((r) => {
            const row = r as unknown as Record<string, unknown>
            return {
              id: r.id,
              documentoId: r.documentoId,
              versaoId: r.versaoId,
              tipoAssinatura: r.tipoAssinatura,
              statusSolicitacao: r.statusSolicitacao,
              providerEnvelopeId: r.providerEnvelopeId,
              providerStatus: r.providerStatus,
              linkAssinaturaExterno: r.linkAssinaturaExterno,
              enviadoEm: r.enviadoEm ? r.enviadoEm.toISOString() : null,
              concluidoEm: r.concluidoEm ? r.concluidoEm.toISOString() : null,
              expiraEm: r.expiraEm ? r.expiraEm.toISOString() : null,
              provedor: row.provedor ?? null,
              createdAt: r.createdAt.toISOString(),
              updatedAt: r.updatedAt.toISOString(),
            }
          }),
          meta: { pagina: q.pagina, limite: q.limite, total },
        })
      } catch (e) {
        return replyError(reply, e)
      }
    },
  )

  server.get(
    '/solicitacoes/:id',
    { schema: { params: idParam } },
    async (request, reply) => {
      try {
        const ctx = requireTenant(request)
        if (getAuthContext(request)?.isSystemAdmin) throw new AccessDeniedError()
        const { id } = request.params as z.infer<typeof idParam>
        const row = await getSolicitacaoById.execute(ctx.tenantId, id)
        return reply.send({
          success: true,
          data: {
            ...row,
            enviadoEm: row.enviadoEm ? row.enviadoEm.toISOString() : null,
            concluidoEm: row.concluidoEm ? row.concluidoEm.toISOString() : null,
            expiraEm: row.expiraEm ? row.expiraEm.toISOString() : null,
            createdAt: row.createdAt.toISOString(),
            updatedAt: row.updatedAt.toISOString(),
            signatarios: (row.signatarios ?? []).map((s) => ({
              ...s,
              assinadoEm: s.assinadoEm ? s.assinadoEm.toISOString() : null,
              createdAt: s.createdAt.toISOString(),
              updatedAt: s.updatedAt.toISOString(),
            })),
            artefatos: (row.artefatos ?? []).map((a) => ({
              ...a,
              createdAt: a.createdAt.toISOString(),
            })),
            evidencias: (row.evidencias ?? []).map((e) => ({
              ...e,
              createdAt: (e.createdAt as Date).toISOString(),
            })),
          },
        })
      } catch (e) {
        return replyError(reply, e)
      }
    },
  )

  server.post(
    '/solicitacoes/:id/enviar',
    { schema: { params: idParam } },
    async (request, reply) => {
      try {
        const ctx = requireTenant(request)
        if (getAuthContext(request)?.isSystemAdmin) throw new AccessDeniedError()
        const { id } = request.params as z.infer<typeof idParam>
        const result = await enviarSolicitacao.execute(ctx.tenantId, id)
        return reply.send({ success: true, message: 'Solicitação enviada', data: result })
      } catch (e) {
        return replyError(reply, e)
      }
    },
  )

  server.post(
    '/solicitacoes/:id/sincronizar',
    { schema: { params: idParam } },
    async (request, reply) => {
      try {
        const ctx = requireTenant(request)
        if (getAuthContext(request)?.isSystemAdmin) throw new AccessDeniedError()
        const { id } = request.params as z.infer<typeof idParam>
        const result = await sincronizarSolicitacao.execute(ctx.tenantId, id)
        return reply.send({ success: true, message: 'Status sincronizado', data: result })
      } catch (e) {
        return replyError(reply, e)
      }
    },
  )

  server.post(
    '/solicitacoes/:id/cancelar',
    { schema: { params: idParam } },
    async (request, reply) => {
      try {
        const ctx = requireTenant(request)
        if (getAuthContext(request)?.isSystemAdmin) throw new AccessDeniedError()
        const { id } = request.params as z.infer<typeof idParam>
        const result = await cancelarSolicitacao.execute(ctx.tenantId, id)
        return reply.send({ success: true, message: 'Solicitação cancelada', data: result })
      } catch (e) {
        return replyError(reply, e)
      }
    },
  )

  server.get(
    '/solicitacoes/:id/artefatos',
    { schema: { params: idParam } },
    async (request, reply) => {
      try {
        const ctx = requireTenant(request)
        if (getAuthContext(request)?.isSystemAdmin) throw new AccessDeniedError()
        const { id } = request.params as z.infer<typeof idParam>
        const rows = await listArtefatos.execute(ctx.tenantId, id)
        return reply.send({
          success: true,
          data: rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })),
        })
      } catch (e) {
        return replyError(reply, e)
      }
    },
  )

  server.post(
    '/solicitacoes/:id/verificar',
    { schema: { params: idParam } },
    async (request, reply) => {
      try {
        const ctx = requireTenant(request)
        if (getAuthContext(request)?.isSystemAdmin) throw new AccessDeniedError()
        const { id } = request.params as z.infer<typeof idParam>
        const result = await verificarAssinatura.execute(ctx.tenantId, id)
        return reply.send({ success: true, data: result })
      } catch (e) {
        return replyError(reply, e)
      }
    },
  )

  // ── Callback (public — no tenant auth) ──────────────────────────────────

  server.post('/callback/:provider', async (request, reply) => {
    const providerCode = String((request.params as Record<string, unknown>)?.provider ?? '')
    const token = String(request.headers['x-callback-token'] ?? '')
    const payload = (request.body as unknown) ?? null
    const requestId = String(request.headers['x-request-id'] ?? '') || null

    const result = await createCallback.execute({ providerCode, token, payload, requestId })
    if (!result.ok) return reply.code(404).send({ ok: false })
    return reply.send({ ok: true })
  })
}
