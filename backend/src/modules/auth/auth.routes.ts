import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import crypto from 'crypto';
import { registerSchema, loginSchema } from './auth.schema.js';
import { registerUser, loginUser, selectTenant, changePassword, loginUserByEmail } from './auth.service.js';
import { authenticate } from '../../utils/authenticate.js';
import prisma from '../../plugins/prisma.js';
import { addRateLimitHit, checkRateLimit, peekRateLimit, getClientIp } from '../../utils/rateLimit.js';
import { normalizeEmail, onlyDigits } from '../../utils/validators.js';
import { verifyHCaptcha } from '../../utils/captcha.js';

export default async function authRoutes(server: FastifyInstance) {
  server.post(
    '/register',
    {
      schema: {
        body: registerSchema,
      },
      preHandler: [
        async (request, reply) => {
          const ip = getClientIp(request.headers as any, (request as any).ip);
          const now = Date.now();
          const rlIp = peekRateLimit({ key: `register:ip:${ip}`, limit: 10, windowMs: 60 * 60 * 1000, now });
          if (!rlIp.ok) return reply.code(429).send({ message: 'Muitas tentativas. Tente novamente mais tarde.' });

          const body = request.body as any;
          const email = typeof body?.email === 'string' ? normalizeEmail(body.email) : '';
          if (email) {
            const rlEmail = peekRateLimit({ key: `register:email:${email}`, limit: 10, windowMs: 24 * 60 * 60 * 1000, now });
            if (!rlEmail.ok) return reply.code(429).send({ message: 'Limite diário atingido para este e-mail.' });
          }
          const cpf = typeof body?.cpf === 'string' ? onlyDigits(body.cpf) : '';
          if (cpf) {
            const rlCpf = peekRateLimit({ key: `register:cpf:${cpf}`, limit: 4, windowMs: 24 * 60 * 60 * 1000, now });
            if (!rlCpf.ok) return reply.code(429).send({ message: 'Limite de trial atingido para este CPF.' });
          }

          if (process.env.HCAPTCHA_SECRET) {
            const captchaToken = typeof body?.captchaToken === 'string' ? body.captchaToken : '';
            if (!captchaToken) {
              addRateLimitHit({ key: `register:ip:${ip}`, windowMs: 60 * 60 * 1000, now });
              if (email) addRateLimitHit({ key: `register:email:${email}`, windowMs: 24 * 60 * 60 * 1000, now });
              if (cpf) addRateLimitHit({ key: `register:cpf:${cpf}`, windowMs: 24 * 60 * 60 * 1000, now });
              return reply.code(400).send({ message: 'Captcha obrigatório' });
            }
            const verified = await verifyHCaptcha({ token: captchaToken, ip });
            if (!verified.ok) {
              addRateLimitHit({ key: `register:ip:${ip}`, windowMs: 60 * 60 * 1000, now });
              if (email) addRateLimitHit({ key: `register:email:${email}`, windowMs: 24 * 60 * 60 * 1000, now });
              if (cpf) addRateLimitHit({ key: `register:cpf:${cpf}`, windowMs: 24 * 60 * 60 * 1000, now });
              return reply.code(400).send({ message: 'Captcha inválido' });
            }
          }
        },
      ],
    },
    async (request, reply) => {
      const ip = getClientIp(request.headers as any, (request as any).ip);
      const now = Date.now();
      try {
        const body = request.body as any;
        if (typeof body?.googleToken === 'string' && body.googleToken.length > 0) {
          const payload = (server.jwt as any).verify(body.googleToken) as any;
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
        const body = request.body as any;
        const email = typeof body?.email === 'string' ? normalizeEmail(body.email) : '';
        const cpf = typeof body?.cpf === 'string' ? onlyDigits(body.cpf) : '';
        addRateLimitHit({ key: `register:ip:${ip}`, windowMs: 60 * 60 * 1000, now });
        if (email) addRateLimitHit({ key: `register:email:${email}`, windowMs: 24 * 60 * 60 * 1000, now });
        if (cpf) addRateLimitHit({ key: `register:cpf:${cpf}`, windowMs: 24 * 60 * 60 * 1000, now });
        if (error.code === 'P2002') { // Prisma unique constraint violation
            return reply.code(409).send({ message: 'Email, CPF, CNPJ or Tenant Slug already exists' });
        }
        return reply.code(500).send({ message: error.message || 'Internal Server Error' });
      }
    }
  );

  server.get('/google/status', async (request, reply) => {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const redirectUri = process.env.GOOGLE_REDIRECT_URI;
    return reply.send({ enabled: Boolean(clientId && clientSecret && redirectUri) });
  });

  server.get('/google/start', async (request, reply) => {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const redirectUri = process.env.GOOGLE_REDIRECT_URI;
    if (!clientId || !redirectUri) {
      return reply.code(500).send({ message: 'Google OAuth não configurado' });
    }

    const state = (server.jwt as any).sign({ nonce: crypto.randomUUID() }, { expiresIn: '10m' });

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
      (server.jwt as any).verify(state);
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

    const googleToken = (server.jwt as any).sign({ email, name, sub }, { expiresIn: '10m' });
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
        const payload = (server.jwt as any).verify(googleToken) as any;
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
      schema: {
        body: loginSchema,
      },
      preHandler: [
        async (request, reply) => {
          const ip = getClientIp(request.headers as any, (request as any).ip);
          const now = Date.now();
          const rlIp = checkRateLimit({ key: `login:ip:${ip}`, limit: 25, windowMs: 10 * 60 * 1000, now });
          if (!rlIp.ok) return reply.code(429).send({ message: 'Muitas tentativas. Tente novamente mais tarde.' });

          const body = request.body as any;
          const email = typeof body?.email === 'string' ? normalizeEmail(body.email) : '';
          if (email) {
            const rlEmail = checkRateLimit({ key: `login:email:${email}`, limit: 10, windowMs: 10 * 60 * 1000, now });
            if (!rlEmail.ok) return reply.code(429).send({ message: 'Muitas tentativas para este e-mail. Tente novamente mais tarde.' });
          }
        },
      ],
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
                newPassword: z
                  .string()
                  .min(8, { message: 'Senha deve ter no mínimo 8 caracteres' })
                  .regex(/^(?=.*[A-Za-z])(?=.*\d).+$/, { message: 'Senha deve conter pelo menos 1 letra e 1 número' })
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
