import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import multipart from '@fastify/multipart';
import dotenv from 'dotenv';
import authRoutes from './modules/auth/auth.routes.js';
import obraRoutes from './modules/obras/obras.routes.js';
import adminRoutes from './modules/admin/admin.routes.js';
import { z } from 'zod';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';

dotenv.config();

const server = Fastify({
  logger: true
});

server.setValidatorCompiler(validatorCompiler);
server.setSerializerCompiler(serializerCompiler);

server.register(cors, {
  origin: true // Allow all for dev
});

server.register(multipart, {
  limits: {
    fileSize: 10 * 1024 * 1024,
    files: 1
  }
});

server.register(jwt, {
  secret: process.env.JWT_SECRET || 'supersecret'
});

server.register(authRoutes, { prefix: '/api/auth' });
server.register(obraRoutes, { prefix: '/api/obras' });
server.register(adminRoutes, { prefix: '/api/admin' });

server.get('/health', async (request, reply) => {
  return { status: 'ok' };
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
