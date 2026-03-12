import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { checkSystemAdmin } from '../../utils/authenticate.js';
import { exportTenantBackup, restoreTenantBackup } from './backup.service.js';

export default async function backupRoutes(server: FastifyInstance) {
  server.addHook('onRequest', checkSystemAdmin);

  server.get(
    '/tenants/:id/backup',
    {
      schema: {
        params: z.object({ id: z.coerce.number().int() }),
      },
    },
    async (request, reply) => {
      const { id } = request.params as { id: number };
      const data = await exportTenantBackup(id);
      reply.header('content-type', 'application/json; charset=utf-8');
      reply.header('content-disposition', `attachment; filename="tenant-${id}-backup.json"`);
      return reply.send(data);
    }
  );

  server.post(
    '/tenants/:id/restore',
    {
      schema: {
        params: z.object({ id: z.coerce.number().int() }),
        body: z.any(),
      },
    },
    async (request, reply) => {
      const token = process.env.MAINTENANCE_TOKEN;
      if (!token) return reply.code(500).send({ message: 'Maintenance não configurado' });
      const header = String((request.headers as any)['x-maintenance-token'] || '');
      if (header !== token) return reply.code(401).send({ message: 'Unauthorized' });

      const { id } = request.params as { id: number };
      await restoreTenantBackup(id, request.body);
      return reply.send({ restored: true });
    }
  );
}

