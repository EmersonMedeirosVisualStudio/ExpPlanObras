import type { FastifyInstance } from 'fastify'
import { replyError } from '@/shared/errors/HttpError.js'
import { makeMaintenanceUseCases } from '@/modules/maintenance/application/factories/makeMaintenanceUseCases.js'

function verifyToken(request: { headers: unknown }, reply: { code: (n: number) => { send: (b: unknown) => unknown } }) {
  const token = process.env.MAINTENANCE_TOKEN
  if (!token) return reply.code(500).send({ message: 'Maintenance não configurado' })
  const header = String((request.headers as Record<string, unknown>)['x-maintenance-token'] || '')
  if (header !== token) return reply.code(401).send({ message: 'Unauthorized' })
  return null
}

export default async function maintenanceRoutes(server: FastifyInstance) {
  const uc = makeMaintenanceUseCases()

  server.post('/purge-expired', async (request, reply) => {
    const err = verifyToken(request, reply)
    if (err) return err
    try { return reply.send(await uc.purge.execute()) } catch (e) { return replyError(reply, e) }
  })

  server.post('/expire-trials', async (request, reply) => {
    const err = verifyToken(request, reply)
    if (err) return err
    try { return reply.send(await uc.expireTrials.execute()) } catch (e) { return replyError(reply, e) }
  })

  server.post('/subscription-daily', async (request, reply) => {
    const err = verifyToken(request, reply)
    if (err) return err
    try {
      const [trial, paid] = await Promise.all([uc.expireTrials.execute(), uc.processDaily.execute()])
      return reply.send({ trial, paid })
    } catch (e) { return replyError(reply, e) }
  })
}
