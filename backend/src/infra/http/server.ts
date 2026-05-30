import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import multipart from "@fastify/multipart";
import Fastify from "fastify";
import {
  serializerCompiler,
  validatorCompiler,
} from "fastify-type-provider-zod";
import adminRoutes from "@/infra/http/routes/admin.routes.js";
import authRoutes from "@/infra/http/routes/auth.routes.js";
import backupRoutes from "@/infra/http/routes/backup.routes.js";
import billingRoutes from "@/infra/http/routes/billing.routes.js";
import continuidadeRoutes from "@/infra/http/routes/continuidade.routes.js";
import contratosRoutes from "@/infra/http/routes/contratos.routes.js";
import documentosRoutes from "@/infra/http/routes/documentos.routes.js";
import documentosQualificadosRoutes from "@/infra/http/routes/documentos-qualificados.routes.js";
import geoRoutes from "@/infra/http/routes/geo.routes.js";
import governancaDadosRoutes from "@/infra/http/routes/governanca.routes.js";
import grcRoutes from "@/infra/http/routes/grc.routes.js";
import maintenanceRoutes from "@/infra/http/routes/maintenance.routes.js";
import obraRoutes from "@/infra/http/routes/obras.routes.js";
import observabilidadeRoutes from "@/infra/http/routes/observabilidade.routes.js";
import playbooksRoutes from "@/infra/http/routes/playbooks.routes.js";
import retencaoRoutes from "@/infra/http/routes/retencao.routes.js";
import securityFieldsRoutes from "@/infra/http/routes/security-fields.routes.js";
import mercadoPagoWebhooks from "@/infra/http/routes/mercadopago.routes.js";
import prisma from "@/infra/database/prisma/client.js";

const server = Fastify({ logger: true });

server.setValidatorCompiler(validatorCompiler);
server.setSerializerCompiler(serializerCompiler);

server.register(cors, {
  origin: true,
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: [
    "Authorization",
    "Content-Type",
    "Accept",
    "Origin",
    "X-Requested-With",
  ],
});

server.register(multipart, {
  limits: { fileSize: 200 * 1024 * 1024, files: 5 },
});
server.register(jwt, { secret: process.env.JWT_SECRET || "supersecret" });

server.register(authRoutes, { prefix: "/api/auth" });
server.register(geoRoutes, { prefix: "/api/geo" });
server.register(obraRoutes, { prefix: "/api/obras" });
server.register(contratosRoutes, { prefix: "/api/contratos" });
server.register(adminRoutes, { prefix: "/api/admin" });
server.register(backupRoutes, { prefix: "/api/admin" });
server.register(billingRoutes, { prefix: "/api/billing" });
server.register(mercadoPagoWebhooks, { prefix: "/api/webhooks" });
server.register(maintenanceRoutes, { prefix: "/api/maintenance" });
server.register(securityFieldsRoutes, { prefix: "/api/v1/security/fields" });
server.register(documentosRoutes, { prefix: "/api/v1/documentos" });
server.register(documentosQualificadosRoutes, {
  prefix: "/api/v1/documentos/qualificados",
});
server.register(governancaDadosRoutes, { prefix: "/api/v1/governanca-dados" });
server.register(retencaoRoutes, { prefix: "/api/v1/retencao" });
server.register(observabilidadeRoutes, { prefix: "/api/v1/observabilidade" });
server.register(playbooksRoutes, { prefix: "/api/v1/observabilidade" });
server.register(continuidadeRoutes, { prefix: "/api/v1/continuidade" });
server.register(grcRoutes, { prefix: "/api/v1/grc" });

server.get("/health", async () => ({ status: "ok" }));

server.get("/health/db", async (request, reply) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { status: "ok", db: "ok" };
  } catch (e) {
    request.log.error(e);
    return reply.code(500).send({ status: "error", db: "error" });
  }
});

export default server;
