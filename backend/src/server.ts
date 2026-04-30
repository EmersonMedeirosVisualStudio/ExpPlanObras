import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import multipart from '@fastify/multipart';
import dotenv from 'dotenv';
import authRoutes from './modules/auth/auth.routes.js';
import obraRoutes from './modules/obras/obras.routes.js';
import contratosRoutes from './modules/contratos/contratos.routes.js';
import adminRoutes from './modules/admin/admin.routes.js';
import billingRoutes from './modules/billing/billing.routes.js';
import mercadoPagoWebhooks from './modules/webhooks/mercadopago.routes.js';
import maintenanceRoutes from './modules/maintenance/maintenance.routes.js';
import backupRoutes from './modules/backup/backup.routes.js';
import geoRoutes from './modules/geo/geo.routes.js';
import v1Routes from './modules/v1/v1.routes.js';
import securityFieldsRoutes from './modules/security-fields/security-fields.routes.js';
import documentosRoutes from './modules/documentos/documentos.routes.js';
import documentosQualificadosRoutes from './modules/documentos-qualificados/documentos-qualificados.routes.js';
import governancaDadosRoutes from './modules/governanca-dados/governanca.routes.js';
import retencaoRoutes from './modules/retencao/retencao.routes.js';
import observabilidadeRoutes from './modules/observabilidade/observabilidade.routes.js';
import playbooksRoutes from './modules/playbooks/playbooks.routes.js';
import continuidadeRoutes from './modules/continuidade/continuidade.routes.js';
import grcRoutes from './modules/grc/grc.routes.js';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import prisma from './plugins/prisma.js';

dotenv.config();

const server = Fastify({
  logger: true
});

server.setValidatorCompiler(validatorCompiler);
server.setSerializerCompiler(serializerCompiler);

server.register(cors, {
  origin: true,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Authorization', 'Content-Type', 'Accept', 'Origin', 'X-Requested-With'],
});

server.register(multipart, {
  limits: {
    fileSize: 10 * 1024 * 1024,
    files: 5
  }
});

server.register(jwt, {
  secret: process.env.JWT_SECRET || 'supersecret'
});

server.register(authRoutes, { prefix: '/api/auth' });
server.register(v1Routes, { prefix: '/api/v1' });
server.register(geoRoutes, { prefix: '/api/geo' });
server.register(obraRoutes, { prefix: '/api/obras' });
server.register(contratosRoutes, { prefix: '/api/contratos' });
server.register(adminRoutes, { prefix: '/api/admin' });
server.register(backupRoutes, { prefix: '/api/admin' });
server.register(billingRoutes, { prefix: '/api/billing' });
server.register(mercadoPagoWebhooks, { prefix: '/api/webhooks' });
server.register(maintenanceRoutes, { prefix: '/api/maintenance' });
server.register(securityFieldsRoutes, { prefix: '/api/v1/security/fields' });
server.register(documentosRoutes, { prefix: '/api/v1/documentos' });
server.register(documentosQualificadosRoutes, { prefix: '/api/v1/documentos/qualificados' });
server.register(governancaDadosRoutes, { prefix: '/api/v1/governanca-dados' });
server.register(retencaoRoutes, { prefix: '/api/v1/retencao' });
server.register(observabilidadeRoutes, { prefix: '/api/v1/observabilidade' });
server.register(playbooksRoutes, { prefix: '/api/v1/observabilidade' });
server.register(continuidadeRoutes, { prefix: '/api/v1/continuidade' });
server.register(grcRoutes, { prefix: '/api/v1/grc' });

server.get('/health', async (request, reply) => {
  return { status: 'ok' };
});

server.get('/health/db', async (request, reply) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { status: 'ok', db: 'ok' };
  } catch (e: any) {
    request.log.error(e);
    return reply.code(500).send({ status: 'error', db: 'error' });
  }
});

const start = async () => {
  try {
    const port = parseInt(process.env.PORT || process.env.API_PORT || '3333');
    await server.listen({ port, host: '0.0.0.0' });
    console.log(`Server listening on port ${port}`);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
};

start();
