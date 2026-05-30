import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { replyError } from '@/shared/errors/HttpError.js'
import { checkSystemAdmin } from '@/infra/http/middlewares/checkSystemAdmin.js'
import { makeAdminUseCases } from '@/application/contracts/makeAdminUseCases.js'
import { createTenantDto, type CreateTenantDto } from '@/application/dto/admin/createTenantDto.js'
import { updateTenantDto, type UpdateTenantDto } from '@/application/dto/admin/updateTenantDto.js'
import { resolveMapLink } from '@/infra/providers/admin/MapsResolverService.js'

function actorId(request: { user?: unknown }): number | null {
  const u = request.user as Record<string, unknown> | undefined
  return typeof u?.userId === 'number' ? u.userId : null
}

const tenantIdParam = z.object({ id: z.coerce.number().int() })

export default async function adminRoutes(server: FastifyInstance) {
  const uc = makeAdminUseCases()

  server.addHook('onRequest', checkSystemAdmin)

  // ── Tenants ───────────────────────────────────────────────────────────────

  server.post('/tenants', { schema: { body: createTenantDto } }, async (request, reply) => {
    try {
      return reply.code(201).send(await uc.createTenant.execute(request.body as CreateTenantDto, actorId(request)))
    } catch (e: unknown) {
      if ((e as { code?: string })?.code === 'P2002') return reply.code(409).send({ message: 'Email, CPF, CNPJ or Slug already exists' })
      return replyError(reply, e)
    }
  })

  server.get('/tenants', async (_request, reply) => {
    return reply.send(await uc.getAllTenants.execute())
  })

  server.put('/tenants/:id', { schema: { params: tenantIdParam, body: updateTenantDto } }, async (request, reply) => {
    try {
      const { id } = request.params as { id: number }
      return reply.send(await uc.updateTenant.execute(id, request.body as UpdateTenantDto, actorId(request)))
    } catch (e) { return replyError(reply, e) }
  })

  server.delete('/tenants/:id', { schema: { params: tenantIdParam } }, async (request, reply) => {
    try {
      const { id } = request.params as { id: number }
      await uc.deleteTenant.execute(id)
      return reply.code(204).send()
    } catch (e) { return replyError(reply, e) }
  })

  // ── Subscription management ───────────────────────────────────────────────

  server.post('/tenants/:id/activate', {
    schema: { params: tenantIdParam, body: z.object({ months: z.coerce.number().int().min(1).max(36).default(1) }) },
  }, async (request, reply) => {
    try {
      const { id } = request.params as { id: number }
      const { months } = request.body as { months: number }
      return reply.send(await uc.activateSubscription.execute(id, months, actorId(request)))
    } catch (e) { return replyError(reply, e) }
  })

  server.post('/tenants/claim-accept', {
    schema: { body: z.object({ cnpj: z.string().min(14), email: z.string().email(), plan: z.enum(['ANNUAL', 'BIENNIAL']) }) },
  }, async (request, reply) => {
    try {
      return reply.send(await uc.acceptClaim.execute(request.body as { cnpj: string; email: string; plan: 'ANNUAL' | 'BIENNIAL' }, actorId(request)))
    } catch (e) { return replyError(reply, e) }
  })

  server.post('/tenants/:id/manual-revoke', {
    schema: { params: tenantIdParam, body: z.object({ reason: z.string().min(3) }) },
  }, async (request, reply) => {
    try {
      const { id } = request.params as { id: number }
      const { reason } = request.body as { reason: string }
      return reply.send(await uc.revokeAccess.execute(id, { reason }, actorId(request)))
    } catch (e) { return replyError(reply, e) }
  })

  server.post('/tenants/:id/grant-access', {
    schema: { params: tenantIdParam, body: z.object({ days: z.coerce.number().int() }) },
  }, async (request, reply) => {
    try {
      const { id } = request.params as { id: number }
      const { days } = request.body as { days: number }
      if (![30, 60, 90, 365].includes(days)) return reply.code(400).send({ message: 'Dias inválidos' })
      return reply.send(await uc.grantAccess.execute(id, { reason: 'PAYMENT', days }, actorId(request)))
    } catch (e) { return replyError(reply, e) }
  })

  server.post('/tenants/:id/manual-grant', {
    schema: { params: tenantIdParam, body: z.object({ reason: z.enum(['PAYMENT', 'TRIAL_EXTENSION']), days: z.coerce.number().int() }) },
  }, async (request, reply) => {
    try {
      const { id } = request.params as { id: number }
      const { reason, days } = request.body as { reason: 'PAYMENT' | 'TRIAL_EXTENSION'; days: number }
      return reply.send(await uc.grantAccess.execute(id, { reason, days }, actorId(request)))
    } catch (e) { return replyError(reply, e) }
  })

  server.post('/tenants/:id/representative/reset-password', {
    schema: { params: tenantIdParam, body: z.object({ newPassword: z.string().min(8) }) },
  }, async (request, reply) => {
    try {
      const { id } = request.params as { id: number }
      const { newPassword } = request.body as { newPassword: string }
      return reply.send(await uc.resetPassword.execute(id, newPassword))
    } catch (e) { return replyError(reply, e) }
  })

  // ── History ───────────────────────────────────────────────────────────────

  server.get('/tenants/:id/history', { schema: { params: tenantIdParam } }, async (request, reply) => {
    const { id } = request.params as { id: number }
    return reply.send(await uc.getTenantHistory.execute(id))
  })

  server.post('/tenants/:id/history', {
    schema: { params: tenantIdParam, body: z.object({ message: z.string().min(1), attachmentUrls: z.array(z.string()).optional() }) },
  }, async (request, reply) => {
    try {
      const { id } = request.params as { id: number }
      return reply.code(201).send(
        await uc.addHistory.execute(id, request.body as { message: string; attachmentUrls?: string[] }, actorId(request)),
      )
    } catch (e) { return replyError(reply, e) }
  })

  server.post('/tenants/:id/history/upload', { schema: { params: tenantIdParam } }, async (request, reply) => {
    const { id } = request.params as { id: number }
    const parts = (request as unknown as { parts(): AsyncIterable<{ type: string; fieldname?: string; value?: unknown; file?: AsyncIterable<Buffer>; filename?: string; mimetype?: string }> }).parts()
    let message = ''
    const files: Array<{ filename: string; mimetype: string; buffer: Buffer }> = []

    for await (const part of parts) {
      if (part.type === 'field' && part.fieldname === 'message') { message = String(part.value || ''); continue }
      if (part.type === 'file' && part.filename) {
        const mimetype = String(part.mimetype || '')
        if (!mimetype.startsWith('image/')) return reply.code(400).send({ message: 'Apenas imagens são aceitas' })
        const chunks: Buffer[] = []
        for await (const chunk of part.file!) chunks.push(chunk as Buffer)
        files.push({ filename: String(part.filename), mimetype, buffer: Buffer.concat(chunks) })
      }
    }

    if (!message.trim()) return reply.code(400).send({ message: 'Mensagem obrigatória' })
    if (files.length === 0) return reply.code(400).send({ message: 'Envie ao menos 1 imagem' })

    try {
      return reply.code(201).send(await uc.uploadHistoryAttachment.execute(id, { message, files }, actorId(request)))
    } catch (e) { return replyError(reply, e) }
  })

  server.get('/tenant-history/attachments/:id', { schema: { params: z.object({ id: z.coerce.number().int() }) } }, async (request, reply) => {
    const { id } = request.params as { id: number }
    const att = await uc.getHistoryAttachment.execute(id) as { url?: string | null; data?: unknown; mimeType?: string | null; filename?: string | null } | null
    if (!att) return reply.code(404).send({ message: 'Anexo não encontrado' })

    if (att.url && !att.data) return reply.redirect(att.url)
    if (!att.data) return reply.code(404).send({ message: 'Arquivo não encontrado' })

    reply.header('content-type', att.mimeType || 'application/octet-stream')
    reply.header('content-disposition', `inline; filename="${att.filename || `anexo-${id}`}"`)
    return reply.send(att.data)
  })

  // ── Maps resolution ───────────────────────────────────────────────────────

  server.post('/maps/resolve', { schema: { body: z.object({ link: z.string().min(3) }) } }, async (request, reply) => {
    const { link } = request.body as { link: string }
    try {
      return reply.send(await resolveMapLink(link))
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Erro ao resolver link'
      const status = msg === 'Endereço não encontrado' ? 404 : 400
      return reply.code(status).send({ message: msg })
    }
  })
}
