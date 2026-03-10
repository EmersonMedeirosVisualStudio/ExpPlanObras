import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { registerSchema, loginSchema } from './auth.schema.js';
import { registerUser, loginUser, selectTenant, changePassword } from './auth.service.js';
import { authenticate } from '../../utils/authenticate.js';

export default async function authRoutes(server: FastifyInstance) {
  server.post(
    '/register',
    {
      // schema: {
      //   body: registerSchema,
      // },
    },
    async (request, reply) => {
      try {
        const result = await registerUser(request.body as z.infer<typeof registerSchema>);
        const { tenant, user } = result;
        return reply.code(201).send({ message: 'User registered successfully', tenant, user });
      } catch (error: any) {
        server.log.error(error);
        if (error.code === 'P2002') { // Prisma unique constraint violation
            return reply.code(409).send({ message: 'Email, CPF, CNPJ or Tenant Slug already exists' });
        }
        return reply.code(500).send({ message: error.message || 'Internal Server Error' });
      }
    }
  );

  server.post(
    '/login',
    {
      // schema: {
      //   body: loginSchema,
      // },
    },
    async (request, reply) => {
      try {
        const result = await loginUser(request.body as z.infer<typeof loginSchema>, server);
        return reply.send(result);
      } catch (error: any) {
        server.log.error(error);
        return reply.code(401).send({ message: error.message });
      }
    }
  );

  server.post(
    '/select-tenant',
    {
      schema: {
        body: z.object({
            userId: z.number(),
            tenantId: z.number()
        })
      }
    },
    async (request, reply) => {
        try {
            const { userId, tenantId } = request.body as { userId: number, tenantId: number };
            const result = await selectTenant(userId, tenantId, server);
            return reply.send(result);
        } catch (error: any) {
            server.log.error(error);
            return reply.code(401).send({ message: error.message });
        }
    }
  );

  server.put(
    '/change-password',
    {
        preHandler: [authenticate],
        schema: {
            body: z.object({
                oldPassword: z.string(),
                newPassword: z.string().min(6)
            })
        }
    },
    async (request, reply) => {
        try {
            const user = request.user as { userId: number };
            const { oldPassword, newPassword } = request.body as { oldPassword: string, newPassword: string };
            await changePassword(user.userId, oldPassword, newPassword);
            return reply.send({ message: 'Password changed successfully' });
        } catch (error: any) {
            server.log.error(error);
            return reply.code(400).send({ message: error.message });
        }
    }
  );
}
