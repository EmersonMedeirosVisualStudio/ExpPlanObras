import type { FastifyInstance } from 'fastify'
import { verifyMercadoPagoSignature, syncTenantFromPreapproval } from '@/modules/billing/infrastructure/services/billingOps.js'

export default async function mercadoPagoWebhooks(server: FastifyInstance) {
  server.post('/mercadopago', async (request, reply) => {
    const headers = request.headers as Record<string, string | string[] | undefined>
    const query = request.query as Record<string, string | undefined>
    const body = request.body as Record<string, unknown> | null

    const dataId =
      (typeof query?.['data.id'] === 'string' && query['data.id']) ||
      (typeof (body?.data as Record<string, unknown>)?.id === 'string' && (body?.data as Record<string, unknown>)?.id as string) ||
      (typeof (body?.data as Record<string, unknown>)?.id === 'number' && String((body?.data as Record<string, unknown>)?.id)) ||
      (typeof query?.id === 'string' && query.id) ||
      undefined

    if (!dataId) {
      return reply.code(200).send({ ok: true })
    }

    const verified = verifyMercadoPagoSignature({
      xSignature: headers['x-signature'] as string | undefined,
      xRequestId: headers['x-request-id'] as string | undefined,
      dataId,
    })

    if (!verified.ok) {
      return reply.code(401).send({ message: 'Invalid signature' })
    }

    await syncTenantFromPreapproval(dataId)
    return reply.code(200).send({ ok: true })
  })
}
