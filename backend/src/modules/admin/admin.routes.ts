
import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createTenantSchema, updateTenantSchema } from './admin.schema.js';
import { createTenantByAdmin, getAllTenants, updateTenant, deleteTenant, activateTenantSubscription, grantTenantAccessDays } from './admin.service.js';
import { checkSystemAdmin } from '../../utils/authenticate.js';

export default async function adminRoutes(server: FastifyInstance) {
  server.addHook('onRequest', checkSystemAdmin);

  server.post(
    '/tenants',
    {
      schema: {
        body: createTenantSchema,
      },
    },
    async (request, reply) => {
      try {
        const result = await createTenantByAdmin(request.body as z.infer<typeof createTenantSchema>);
        return reply.code(201).send(result);
      } catch (error: any) {
        server.log.error(error);
        if (error.code === 'P2002') {
            return reply.code(409).send({ message: 'Email, CPF, CNPJ or Slug already exists' });
        }
        return reply.code(500).send({ message: error.message || 'Internal Server Error' });
      }
    }
  );

  server.get(
    '/tenants',
    async (request, reply) => {
        const tenants = await getAllTenants();
        return reply.send(tenants);
    }
  );

  server.put(
    '/tenants/:id',
    {
      schema: {
        params: z.object({
            id: z.coerce.number().int()
        }),
        body: updateTenantSchema
      }
    },
    async (request, reply) => {
        const { id } = request.params as { id: number };
        try {
            console.log(`Updating tenant ${id} with data:`, request.body);
            const tenant = await updateTenant(id, request.body as z.infer<typeof updateTenantSchema>);
            return reply.send(tenant);
        } catch (error: any) {
            server.log.error(error);
            return reply.code(500).send({ message: error.message || 'Error updating tenant' });
        }
    }
  );

  server.post(
    '/tenants/:id/activate',
    {
      schema: {
        params: z.object({
          id: z.coerce.number().int(),
        }),
        body: z.object({
          months: z.coerce.number().int().min(1).max(36).default(1),
        }),
      },
    },
    async (request, reply) => {
      const { id } = request.params as { id: number };
      const { months } = request.body as { months: number };
      const tenant = await activateTenantSubscription(id, months);
      return reply.send(tenant);
    }
  );

  server.post(
    '/tenants/:id/grant-access',
    {
      schema: {
        params: z.object({
          id: z.coerce.number().int(),
        }),
        body: z.object({
          days: z.coerce.number().int(),
        }),
      },
    },
    async (request, reply) => {
      const { id } = request.params as { id: number };
      const { days } = request.body as { days: number };
      if (![30, 60, 90, 365].includes(days)) {
        return reply.code(400).send({ message: 'Dias inválidos' });
      }
      const tenant = await grantTenantAccessDays(id, days);
      return reply.send(tenant);
    }
  );

  server.delete(
    '/tenants/:id',
    {
        schema: {
            params: z.object({
                id: z.coerce.number().int()
            })
        }
    },
    async (request, reply) => {
        const { id } = request.params as { id: number };
        try {
            await deleteTenant(id);
            return reply.code(204).send();
        } catch (error) {
            return reply.code(404).send({ message: 'Tenant not found' });
        }
    }
  );
}
