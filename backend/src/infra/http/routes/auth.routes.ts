import crypto from "crypto";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { loginDto } from "@/application/dto/auth/loginDto.js";
import { registerDto } from "@/application/dto/auth/registerDto.js";
import { makeAuthUseCases } from "@/application/contracts/makeAuthUseCases.js";
import { JwtTokenSigner } from "@/infra/providers/auth/JwtTokenSigner.js";
import { replyError } from "@/shared/errors/HttpError.js";
import { authenticate } from "@/infra/http/middlewares/authenticate.js";
import { verifyHCaptcha } from "@/shared/utils/captcha.js";
import {
  addRateLimitHit,
  checkRateLimit,
  getClientIp,
  peekRateLimit,
} from "@/shared/utils/rateLimit.js";
import { normalizeEmail, onlyDigits } from "@/shared/utils/validators.js";

export default async function authRoutes(server: FastifyInstance) {
  const tokenSigner = new JwtTokenSigner(server.jwt);
  const useCases = makeAuthUseCases(tokenSigner);

  // POST /register
  server.post(
    "/register",
    { schema: { body: registerDto } },
    async (request, reply) => {
      const ip = getClientIp(
        request.headers as Record<string, string>,
        (request as unknown as { ip: string }).ip,
      );
      const now = Date.now();
      const body = request.body as z.infer<typeof registerDto>;

      const rlIp = peekRateLimit({
        key: `register:ip:${ip}`,
        limit: 10,
        windowMs: 60 * 60 * 1000,
        now,
      });
      if (!rlIp.ok)
        return reply
          .code(429)
          .send({ message: "Muitas tentativas. Tente novamente mais tarde." });

      const email = normalizeEmail(body.email);
      const cpf = onlyDigits(body.cpf ?? "");

      if (email) {
        const rl = peekRateLimit({
          key: `register:email:${email}`,
          limit: 10,
          windowMs: 24 * 60 * 60 * 1000,
          now,
        });
        if (!rl.ok)
          return reply
            .code(429)
            .send({ message: "Limite diário atingido para este e-mail." });
      }
      if (cpf) {
        const rl = peekRateLimit({
          key: `register:cpf:${cpf}`,
          limit: 4,
          windowMs: 24 * 60 * 60 * 1000,
          now,
        });
        if (!rl.ok)
          return reply
            .code(429)
            .send({ message: "Limite de trial atingido para este CPF." });
      }

      if (process.env.HCAPTCHA_SECRET) {
        const captchaToken =
          typeof body.captchaToken === "string" ? body.captchaToken : "";
        if (!captchaToken) {
          addRateLimitHit({
            key: `register:ip:${ip}`,
            windowMs: 60 * 60 * 1000,
            now,
          });
          if (email)
            addRateLimitHit({
              key: `register:email:${email}`,
              windowMs: 24 * 60 * 60 * 1000,
              now,
            });
          if (cpf)
            addRateLimitHit({
              key: `register:cpf:${cpf}`,
              windowMs: 24 * 60 * 60 * 1000,
              now,
            });
          return reply.code(400).send({ message: "Captcha obrigatório" });
        }
        const verified = await verifyHCaptcha({ token: captchaToken, ip });
        if (!verified.ok) {
          addRateLimitHit({
            key: `register:ip:${ip}`,
            windowMs: 60 * 60 * 1000,
            now,
          });
          if (email)
            addRateLimitHit({
              key: `register:email:${email}`,
              windowMs: 24 * 60 * 60 * 1000,
              now,
            });
          if (cpf)
            addRateLimitHit({
              key: `register:cpf:${cpf}`,
              windowMs: 24 * 60 * 60 * 1000,
              now,
            });
          return reply.code(400).send({ message: "Captcha inválido" });
        }
      }

      try {
        // Resolve Google token if provided
        if (
          typeof body.googleToken === "string" &&
          body.googleToken.length > 0
        ) {
          const payload = (
            server.jwt as unknown as {
              verify: (t: string) => Record<string, unknown>;
            }
          ).verify(body.googleToken);
          (body as Record<string, unknown>).email = payload?.email;
          (body as Record<string, unknown>).name = payload?.name || body.name;
          (body as Record<string, unknown>).oauthProvider = "google";
          (body as Record<string, unknown>).oauthId = payload?.sub;
        }
        const result = await useCases.register.execute(body);
        return reply
          .code(201)
          .send({
            message: "User registered successfully",
            tenant: result.tenant,
            user: result.user,
          });
      } catch (err) {
        addRateLimitHit({
          key: `register:ip:${ip}`,
          windowMs: 60 * 60 * 1000,
          now,
        });
        if (email)
          addRateLimitHit({
            key: `register:email:${email}`,
            windowMs: 24 * 60 * 60 * 1000,
            now,
          });
        if (cpf)
          addRateLimitHit({
            key: `register:cpf:${cpf}`,
            windowMs: 24 * 60 * 60 * 1000,
            now,
          });
        return replyError(reply, err);
      }
    },
  );

  // GET /google/status
  server.get("/google/status", async (_request, reply) => {
    return reply.send({
      enabled: Boolean(
        process.env.GOOGLE_CLIENT_ID &&
        process.env.GOOGLE_CLIENT_SECRET &&
        process.env.GOOGLE_REDIRECT_URI,
      ),
    });
  });

  // GET /google/start
  server.get("/google/start", async (_request, reply) => {
    const { GOOGLE_CLIENT_ID: clientId, GOOGLE_REDIRECT_URI: redirectUri } =
      process.env;
    if (!clientId || !redirectUri)
      return reply.code(500).send({ message: "Google OAuth não configurado" });
    const state = (
      server.jwt as unknown as { sign: (p: unknown, o: unknown) => string }
    ).sign({ nonce: crypto.randomUUID() }, { expiresIn: "10m" });
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: "openid email profile",
      state,
      prompt: "select_account",
    });
    return reply.redirect(
      `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`,
    );
  });

  // GET /google/callback
  server.get("/google/callback", async (request, reply) => {
    const {
      GOOGLE_CLIENT_ID: clientId,
      GOOGLE_CLIENT_SECRET: clientSecret,
      GOOGLE_REDIRECT_URI: redirectUri,
      PUBLIC_APP_URL: appUrl,
    } = process.env;
    const query = request.query as Record<string, string>;
    const { code, state } = query;
    if (!appUrl)
      return reply
        .code(500)
        .send({ message: "PUBLIC_APP_URL não configurado" });
    if (!code || !state)
      return reply.code(400).send({ message: "Parâmetros inválidos" });
    if (!clientId || !clientSecret || !redirectUri)
      return reply.code(500).send({ message: "Google OAuth não configurado" });

    try {
      (server.jwt as unknown as { verify: (t: string) => unknown }).verify(
        state,
      );
    } catch {
      return reply.code(401).send({ message: "State inválido" });
    }

    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });
    const tokenJson = (await tokenRes.json().catch(() => null)) as Record<
      string,
      unknown
    > | null;
    if (!tokenRes.ok)
      return reply.code(401).send({ message: "Falha no Google OAuth" });

    const accessToken = tokenJson?.access_token;
    if (!accessToken)
      return reply.code(401).send({ message: "Token inválido" });

    const userinfoRes = await fetch(
      "https://www.googleapis.com/oauth2/v3/userinfo",
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    const userinfo = (await userinfoRes.json().catch(() => null)) as Record<
      string,
      unknown
    > | null;
    if (!userinfoRes.ok)
      return reply.code(401).send({ message: "Falha ao obter perfil Google" });

    const email = String(userinfo?.email || "");
    const name = String(userinfo?.name || "");
    const sub = String(userinfo?.sub || "");
    if (!email || !sub || !userinfo?.email_verified)
      return reply.code(401).send({ message: "Conta Google inválida" });

    const googleToken = (
      server.jwt as unknown as { sign: (p: unknown, o: unknown) => string }
    ).sign({ email, name, sub }, { expiresIn: "10m" });
    const base = appUrl.replace(/\/$/, "");
    const redirect = `${base}/login?googleToken=${encodeURIComponent(googleToken)}&email=${encodeURIComponent(email)}&name=${encodeURIComponent(name)}`;

    const exists = await useCases.userRepo
      .existsByEmail(email)
      .catch(() => false);
    return reply.redirect(
      `${redirect}&${exists ? "googleLogin=1" : "mode=register"}`,
    );
  });

  // POST /google/login
  server.post(
    "/google/login",
    { schema: { body: z.object({ googleToken: z.string().min(10) }) } },
    async (request, reply) => {
      try {
        const { googleToken } = request.body as { googleToken: string };
        const payload = (
          server.jwt as unknown as {
            verify: (t: string) => Record<string, unknown>;
          }
        ).verify(googleToken);
        const email = String(payload?.email || "");
        if (!email) return reply.code(401).send({ message: "Token inválido" });
        const result = await useCases.login.execute({ email, password: "" });
        return reply.send(result);
      } catch (err) {
        return replyError(reply, err);
      }
    },
  );

  // POST /login
  server.post(
    "/login",
    {
      schema: { body: loginDto },
      preHandler: [
        async (request, reply) => {
          const ip = getClientIp(
            request.headers as Record<string, string>,
            (request as unknown as { ip: string }).ip,
          );
          const now = Date.now();
          const rl = checkRateLimit({
            key: `login:ip:${ip}`,
            limit: 25,
            windowMs: 10 * 60 * 1000,
            now,
          });
          if (!rl.ok)
            return reply
              .code(429)
              .send({
                message: "Muitas tentativas. Tente novamente mais tarde.",
              });
          const email = normalizeEmail(
            (request.body as Record<string, string>)?.email ?? "",
          );
          if (email) {
            const rlEmail = checkRateLimit({
              key: `login:email:${email}`,
              limit: 10,
              windowMs: 10 * 60 * 1000,
              now,
            });
            if (!rlEmail.ok)
              return reply
                .code(429)
                .send({
                  message:
                    "Muitas tentativas para este e-mail. Tente novamente mais tarde.",
                });
          }
        },
      ],
    },
    async (request, reply) => {
      try {
        const result = await useCases.login.execute(
          request.body as z.infer<typeof loginDto>,
        );
        return reply.send(result);
      } catch (err) {
        return replyError(reply, err);
      }
    },
  );

  // POST /select-tenant
  server.post(
    "/select-tenant",
    {
      schema: { body: z.object({ userId: z.number(), tenantId: z.number() }) },
    },
    async (request, reply) => {
      try {
        const { userId, tenantId } = request.body as {
          userId: number;
          tenantId: number;
        };
        const result = await useCases.selectTenant.execute(userId, tenantId);
        return reply.send(result);
      } catch (err) {
        return replyError(reply, err);
      }
    },
  );

  // PUT /change-password
  server.put(
    "/change-password",
    {
      preHandler: [authenticate],
      schema: {
        body: z.object({
          oldPassword: z.string(),
          newPassword: z
            .string()
            .min(8)
            .regex(/^(?=.*[A-Za-z])(?=.*\d).+$/, {
              message: "Senha deve conter pelo menos 1 letra e 1 número",
            }),
        }),
      },
    },
    async (request, reply) => {
      try {
        const { userId } = request.user as { userId: number };
        const { oldPassword, newPassword } = request.body as {
          oldPassword: string;
          newPassword: string;
        };
        await useCases.changePassword.execute(userId, oldPassword, newPassword);
        return reply.send({ message: "Password changed successfully" });
      } catch (err) {
        return replyError(reply, err);
      }
    },
  );
}
