import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { replyError } from '@/shared/errors/HttpError.js'
import { checkSystemAdmin } from '@/shared/middleware/checkSystemAdmin.js'
import { makeBackupUseCases } from '@/modules/backup/application/factories/makeBackupUseCases.js'

export default async function backupRoutes(server: FastifyInstance) {
  const uc = makeBackupUseCases()

  server.addHook('onRequest', checkSystemAdmin)

  server.get('/tenants/:id/backup', { schema: { params: z.object({ id: z.coerce.number().int() }) } }, async (request, reply) => {
    const { id } = request.params as { id: number }
    try {
      const data = await uc.export.execute(id)
      reply.header('content-type', 'application/json; charset=utf-8')
      reply.header('content-disposition', `attachment; filename="tenant-${id}-backup.json"`)
      return reply.send(data)
    } catch (e) { return replyError(reply, e) }
  })

  server.post('/tenants/:id/restore', { schema: { params: z.object({ id: z.coerce.number().int() }), body: z.any() } }, async (request, reply) => {
    const token = process.env.MAINTENANCE_TOKEN
    if (!token) return reply.code(500).send({ message: 'Maintenance não configurado' })
    const header = String((request.headers as Record<string, unknown>)['x-maintenance-token'] || '')
    if (header !== token) return reply.code(401).send({ message: 'Unauthorized' })

    const { id } = request.params as { id: number }
    try {
      await uc.restore.execute(id, request.body)
      return reply.send({ restored: true })
    } catch (e) { return replyError(reply, e) }
  })
}
