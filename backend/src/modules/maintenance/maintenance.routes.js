import { purgeExpiredTenants, expireTrials, processSubscriptionsDaily } from './maintenance.service.js';
export default async function maintenanceRoutes(server) {
    server.post('/purge-expired', async (request, reply) => {
        const token = process.env.MAINTENANCE_TOKEN;
        if (!token) {
            return reply.code(500).send({ message: 'Maintenance não configurado' });
        }
        const header = String(request.headers['x-maintenance-token'] || '');
        if (header !== token) {
            return reply.code(401).send({ message: 'Unauthorized' });
        }
        const result = await purgeExpiredTenants();
        return reply.send(result);
    });
    server.post('/expire-trials', async (request, reply) => {
        const token = process.env.MAINTENANCE_TOKEN;
        if (!token) {
            return reply.code(500).send({ message: 'Maintenance não configurado' });
        }
        const header = String(request.headers['x-maintenance-token'] || '');
        if (header !== token) {
            return reply.code(401).send({ message: 'Unauthorized' });
        }
        const result = await expireTrials();
        return reply.send(result);
    });
    server.post('/subscription-daily', async (request, reply) => {
        const token = process.env.MAINTENANCE_TOKEN;
        if (!token) {
            return reply.code(500).send({ message: 'Maintenance não configurado' });
        }
        const header = String(request.headers['x-maintenance-token'] || '');
        if (header !== token) {
            return reply.code(401).send({ message: 'Unauthorized' });
        }
        const trial = await expireTrials();
        const paid = await processSubscriptionsDaily();
        return reply.send({ trial, paid });
    });
}
