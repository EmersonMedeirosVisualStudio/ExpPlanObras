import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import crypto from 'crypto';
import { registerSchema, loginSchema } from './auth.schema.js';
import { registerUser, loginUser, selectTenant, changePassword, loginUserByEmail } from './auth.service.js';
import { authenticate } from '../../utils/authenticate.js';
import prisma from '../../plugins/prisma.js';

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
        const body = request.body as any;
        if (typeof body?.googleToken === 'string' && body.googleToken.length > 0) {
          const payload = server.jwt.verify(body.googleToken) as any;
          body.email = payload?.email;
          body.name = payload?.name || body.name;
          body.oauthProvider = 'google';
          body.oauthId = payload?.sub;
        }
        const result = await registerUser(body as z.infer<typeof registerSchema>);
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

  server.get('/google/start', async (request, reply) => {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const redirectUri = process.env.GOOGLE_REDIRECT_URI;
    if (!clientId || !redirectUri) {
      return reply.code(500).send({ message: 'Google OAuth não configurado' });
    }

    const state = server.jwt.sign({ nonce: crypto.randomUUID() }, { expiresIn: '10m' });

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'openid email profile',
      state,
      prompt: 'select_account',
    });

    return reply.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
  });

  server.get('/google/callback', async (request, reply) => {
    const query = request.query as any;
    const code = query?.code;
    const state = query?.state;
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const redirectUri = process.env.GOOGLE_REDIRECT_URI;
    const appUrl = process.env.PUBLIC_APP_URL;

    if (!appUrl) return reply.code(500).send({ message: 'PUBLIC_APP_URL não configurado' });
    if (!code || !state) return reply.code(400).send({ message: 'Parâmetros inválidos' });
    if (!clientId || !clientSecret || !redirectUri) return reply.code(500).send({ message: 'Google OAuth não configurado' });

    try {
      server.jwt.verify(state);
    } catch {
      return reply.code(401).send({ message: 'State inválido' });
    }

    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code: String(code),
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });

    const tokenJson: any = await tokenRes.json().catch(() => null);
    if (!tokenRes.ok) {
      return reply.code(401).send({ message: 'Falha no Google OAuth' });
    }

    const accessToken = tokenJson?.access_token;
    if (!accessToken) return reply.code(401).send({ message: 'Token inválido' });

    const userinfoRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const userinfo: any = await userinfoRes.json().catch(() => null);
    if (!userinfoRes.ok) return reply.code(401).send({ message: 'Falha ao obter perfil Google' });

    const email = String(userinfo?.email || '');
    const name = String(userinfo?.name || '');
    const sub = String(userinfo?.sub || '');
    const emailVerified = Boolean(userinfo?.email_verified);
    if (!email || !sub || !emailVerified) {
      return reply.code(401).send({ message: 'Conta Google inválida' });
    }

    const googleToken = server.jwt.sign({ email, name, sub }, { expiresIn: '10m' });
    const base = appUrl.replace(/\/$/, '');
    const redirect = `${base}/login?googleToken=${encodeURIComponent(googleToken)}&email=${encodeURIComponent(email)}&name=${encodeURIComponent(name)}`;

    const exists = await prisma.user.findUnique({ where: { email } }).catch(() => null);
    if (exists) {
      return reply.redirect(`${redirect}&googleLogin=1`);
    }
    return reply.redirect(`${redirect}&mode=register`);
  });

  server.post(
    '/google/login',
    {
      schema: {
        body: z.object({
          googleToken: z.string().min(10),
        }),
      },
    },
    async (request, reply) => {
      try {
        const { googleToken } = request.body as { googleToken: string };
        const payload = server.jwt.verify(googleToken) as any;
        const email = String(payload?.email || '');
        if (!email) return reply.code(401).send({ message: 'Token inválido' });
        const result = await loginUserByEmail(email, server);
        return reply.send(result);
      } catch (error: any) {
        server.log.error(error);
        return reply.code(401).send({ message: 'Falha no login Google' });
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
