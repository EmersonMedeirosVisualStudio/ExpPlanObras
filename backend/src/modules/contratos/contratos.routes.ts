import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authenticate } from '../../utils/authenticate.js';
import { createContratoSchema, updateContratoSchema } from './contratos.schema.js';
import { createContrato, listContratos, updateContrato } from './contratos.service.js';

export default async function contratosRoutes(server: FastifyInstance) {
  server.addHook('onRequest', authenticate);

  server.addHook('preHandler', async (request, reply) => {
    const tenantId = (request.user as any)?.tenantId;
    if (typeof tenantId !== 'number') {
      return reply.code(403).send({ message: 'Tenant não selecionado' });
    }
  });

  server.get('/', async (request, reply) => {
    const tenantId = (request.user as any).tenantId as number;
    const rows = await listContratos(tenantId);
    return reply.send(rows);
  });

  server.post(
    '/',
    { schema: { body: createContratoSchema } },
    async (request, reply) => {
      const tenantId = (request.user as any).tenantId as number;
      const created = await createContrato(tenantId, request.body as any);
      return reply.send(created);
    }
  );

  server.put(
    '/:id',
    { schema: { params: z.object({ id: z.coerce.number().int().positive() }), body: updateContratoSchema } },
    async (request, reply) => {
      const tenantId = (request.user as any).tenantId as number;
      const { id } = request.params as any;
      try {
        const updated = await updateContrato(tenantId, id, request.body as any);
        return reply.send(updated);
      } catch (e: any) {
        return reply.code(400).send({ message: e?.message || 'Erro ao atualizar contrato' });
      }
    }
  );
}

