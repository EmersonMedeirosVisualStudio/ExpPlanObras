import { FastifyInstance } from 'fastify';
import { purgeExpiredTenants } from './maintenance.service.js';

export default async function maintenanceRoutes(server: FastifyInstance) {
  server.post('/purge-expired', async (request, reply) => {
    const token = process.env.MAINTENANCE_TOKEN;
    if (!token) {
      return reply.code(500).send({ message: 'Maintenance não configurado' });
    }
    const header = String((request.headers as any)['x-maintenance-token'] || '');
    if (header !== token) {
      return reply.code(401).send({ message: 'Unauthorized' });
    }
    const result = await purgeExpiredTenants();
    return reply.send(result);
  });
}

