import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { replyError } from '@/shared/errors/HttpError.js'
import { authenticate } from '@/infra/http/middlewares/authenticate.js'
import { makeBillingUseCases } from '@/application/contracts/makeBillingUseCases.js'
import { createCheckoutDto } from '@/application/dto/billing/createCheckoutDto.js'

export default async function billingRoutes(server: FastifyInstance) {
  const uc = makeBillingUseCases()

  server.post('/checkout', { preHandler: [authenticate], schema: { body: createCheckoutDto } }, async (request, reply) => {
    const { plan } = request.body as { plan: 'ANNUAL' | 'BIENNIAL' }
    const user = request.user as Record<string, unknown>
    const tenantId = user?.tenantId
    const email = user?.email
    if (typeof tenantId !== 'number' || typeof email !== 'string') {
      return reply.code(403).send({ message: 'Tenant não selecionado' })
    }
    try {
      return reply.send(await uc.createCheckout.execute(tenantId, email, plan))
    } catch (e) { return replyError(reply, e) }
  })

  server.post('/checkout-claim', {
    schema: { body: z.object({ cnpj: z.string().min(14), email: z.string().email(), plan: z.enum(['ANNUAL', 'BIENNIAL']) }) },
  }, async (request, reply) => {
    const { cnpj, email, plan } = request.body as { cnpj: string; email: string; plan: 'ANNUAL' | 'BIENNIAL' }
    try {
      return reply.send(await uc.createClaimCheckout.execute(cnpj, email, plan))
    } catch (e: unknown) {
      if (e instanceof Error && e.message === 'Empresa não encontrada') return reply.code(404).send({ message: e.message })
      return replyError(reply, e)
    }
  })
}
