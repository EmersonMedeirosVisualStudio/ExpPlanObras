import { FastifyInstance } from 'fastify';
import { authenticate } from '../../utils/authenticate.js';
import { createCheckoutSchema, createClaimCheckoutSchema } from './billing.schema.js';
import { createTenantCheckout } from './billing.service.js';
import prisma from '../../plugins/prisma.js';

export default async function billingRoutes(server: FastifyInstance) {
  server.post(
    '/checkout',
    {
      preHandler: [authenticate],
      schema: {
        body: createCheckoutSchema,
      },
    },
    async (request, reply) => {
      const { plan } = request.body as any;
      const user = request.user as any;
      const tenantId = user?.tenantId;
      const email = user?.email;
      if (typeof tenantId !== 'number' || typeof email !== 'string') {
        return reply.code(403).send({ message: 'Tenant não selecionado' });
      }
      const result = await createTenantCheckout(tenantId, email, plan);
      return reply.send(result);
    }
  );

  server.post(
    '/checkout-claim',
    {
      schema: {
        body: createClaimCheckoutSchema,
      },
    },
    async (request, reply) => {
      const { cnpj, email, plan } = request.body as any;
      const tenant = await prisma.tenant.findUnique({ where: { cnpj } }).catch(() => null);
      if (!tenant) {
        return reply.code(404).send({ message: 'Empresa não encontrada' });
      }
      const result = await createTenantCheckout(tenant.id, email, plan);
      return reply.send(result);
    }
  );
}
