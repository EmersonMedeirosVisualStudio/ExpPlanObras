import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createObraSchema, updateObraSchema } from './obras.schema.js';
import { createObra, getObras, getObraById, updateObra, deleteObra } from './obras.service.js';
import { authenticate } from '../../utils/authenticate.js';

export default async function obraRoutes(server: FastifyInstance) {
  server.addHook('onRequest', authenticate);

  server.post(
    '/',
    {
      schema: {
        body: createObraSchema,
      },
    },
    async (request, reply) => {
      const { tenantId } = request.user;
      const obra = await createObra(request.body as z.infer<typeof createObraSchema>, tenantId);
      return reply.code(201).send(obra);
    }
  );

  server.get('/', async (request, reply) => {
    const { tenantId } = request.user;
    const obras = await getObras(tenantId);
    return reply.send(obras);
  });

  server.get(
    '/:id',
    {
      schema: {
        params: z.object({
          id: z.coerce.number().int(),
        }),
      },
    },
    async (request, reply) => {
      const { tenantId } = request.user;
      const { id } = request.params as { id: number };
      const obra = await getObraById(id, tenantId);
      
      if (!obra) {
        return reply.code(404).send({ message: 'Obra not found' });
      }
      
      return reply.send(obra);
    }
  );

  server.put(
    '/:id',
    {
      schema: {
        params: z.object({
          id: z.coerce.number().int(),
        }),
        body: updateObraSchema,
      },
    },
    async (request, reply) => {
      const { tenantId } = request.user;
      const { id } = request.params as { id: number };
      try {
        const obra = await updateObra(id, request.body as z.infer<typeof updateObraSchema>, tenantId);
        return reply.send(obra);
      } catch (error) {
        return reply.code(404).send({ message: 'Obra not found' });
      }
    }
  );

  server.delete(
    '/:id',
    {
      schema: {
        params: z.object({
          id: z.coerce.number().int(),
        }),
      },
    },
    async (request, reply) => {
      const { tenantId } = request.user;
      const { id } = request.params as { id: number };
      try {
        await deleteObra(id, tenantId);
        return reply.code(204).send();
      } catch (error) {
        return reply.code(404).send({ message: 'Obra not found' });
      }
    }
  );
}
