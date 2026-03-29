import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import prisma from '../../plugins/prisma.js';
import { authenticate } from '../../utils/authenticate.js';
import { normalizeEvent } from './normalize.js';
import { redactPayload } from './redaction.js';

type ApiSuccess<T> = { success: true; data: T; meta?: any; message?: string };
type ApiError = { success: false; message: string; errors?: Record<string, string[]> };

function ok<T>(reply: FastifyReply, data: T, input?: { meta?: any; message?: string }) {
  const payload: ApiSuccess<T> = { success: true, data };
  if (input?.meta) payload.meta = input.meta;
  if (input?.message) payload.message = input.message;
  return reply.send(payload);
}

function fail(reply: FastifyReply, code: number, message: string, errors?: Record<string, string[]>) {
  const payload: ApiError = { success: false, message };
  if (errors && Object.keys(errors).length > 0) payload.errors = errors;
  return reply.code(code).send(payload);
}

type AuthCtx =
  | { isSystemAdmin: true; tenantId: number | null; userId: number; role: string }
  | { isSystemAdmin: false; tenantId: number; userId: number; role: string };

function getAuthContext(request: FastifyRequest): AuthCtx | null {
  const u = request.user as any;
  const tenantId = u?.tenantId;
  const userId = u?.userId;
  const role = u?.role;
  const isSystemAdmin = Boolean(u?.isSystemAdmin);
  if (typeof userId !== 'number') return null;
  if (isSystemAdmin)
    return { tenantId: typeof tenantId === 'number' ? tenantId : null, userId, role: typeof role === 'string' ? role : 'SYSTEM_ADMIN', isSystemAdmin: true } as const;
  if (typeof tenantId !== 'number') return null;
  return { tenantId, userId, role: typeof role === 'string' ? role : 'USER', isSystemAdmin: false } as const;
}

export default async function observabilidadeRoutes(server: FastifyInstance) {
  server.addHook('onRequest', authenticate);

  server.post(
    '/eventos',
    {
      schema: {
        body: z.object({
          categoria: z.string(),
          subcategoria: z.string().optional().nullable(),
          nomeEvento: z.string(),
          severidade: z.string().optional(),
          resultado: z.string().optional(),
          origemTipo: z.string().optional(),
          origemChave: z.string().optional().nullable(),
          modulo: z.string().optional().nullable(),
          entidadeTipo: z.string().optional().nullable(),
          entidadeId: z.number().int().optional().nullable(),
          actorTipo: z.string().optional().nullable(),
          actorUserId: z.number().int().optional().nullable(),
          actorEmail: z.string().optional().nullable(),
          targetTipo: z.string().optional().nullable(),
          targetId: z.number().int().optional().nullable(),
          requestId: z.string().optional().nullable(),
          correlationId: z.string().optional().nullable(),
          sessionId: z.string().optional().nullable(),
          traceId: z.string().optional().nullable(),
          ip: z.string().optional().nullable(),
          userAgent: z.string().optional().nullable(),
          rota: z.string().optional().nullable(),
          metodoHttp: z.string().optional().nullable(),
          statusHttp: z.number().int().optional().nullable(),
          payload: z.any().optional().nullable(),
          labelsJson: z.record(z.string(), z.string()).optional().nullable(),
          ocorridoEm: z.string().optional(),
        }),
      },
    },
    async (request, reply) => {
      const ctx = getAuthContext(request);
      if (!ctx) return fail(reply, 401, 'Não autenticado');
      if (ctx.isSystemAdmin) return fail(reply, 403, 'Tenant não selecionado');
      const body = request.body as any;
      const norm = normalizeEvent(body);
      const redacted = body.payload ? redactPayload(body.payload) : null;
      const created = await prisma.observabilidadeEvento.create({
        data: {
          tenantId: ctx.tenantId,
          ...norm,
          payloadRedactedJson: redacted,
        },
      });
      return ok(reply, { id: created.id, eventId: created.eventId }, { message: 'Evento registrado' });
    }
  );

  server.get('/eventos', async (request, reply) => {
    const ctx = getAuthContext(request);
    if (!ctx) return fail(reply, 401, 'Não autenticado');
    if (ctx.isSystemAdmin) return fail(reply, 403, 'Tenant não selecionado');
    const q = z
      .object({
        pagina: z.coerce.number().int().min(1).default(1),
        limite: z.coerce.number().int().min(1).max(100).default(30),
        categoria: z.string().optional(),
        severidade: z.string().optional(),
        resultado: z.string().optional(),
        origemTipo: z.string().optional(),
        texto: z.string().optional(),
        desde: z.string().optional(),
        ate: z.string().optional(),
      })
      .parse(request.query || {});
    const where: any = { tenantId: ctx.tenantId };
    if (q.categoria) where.categoria = String(q.categoria).toUpperCase();
    if (q.severidade) where.severidade = String(q.severidade).toUpperCase();
    if (q.resultado) where.resultado = String(q.resultado).toUpperCase();
    if (q.origemTipo) where.origemTipo = String(q.origemTipo).toUpperCase();
    const filters: any[] = [];
    if (q.texto) {
      const t = String(q.texto);
      filters.push({ nomeEvento: { contains: t, mode: 'insensitive' } });
      filters.push({ rota: { contains: t, mode: 'insensitive' } });
      filters.push({ actorEmail: { contains: t, mode: 'insensitive' } });
      where.OR = filters;
    }
    if (q.desde || q.ate) {
      where.ocorridoEm = {};
      if (q.desde) (where.ocorridoEm as any).gte = new Date(q.desde);
      if (q.ate) (where.ocorridoEm as any).lte = new Date(q.ate);
    }
    const skip = (q.pagina - 1) * q.limite;
    const [rows, total] = await Promise.all([
      prisma.observabilidadeEvento.findMany({
        where,
        orderBy: [{ ocorridoEm: 'desc' }, { id: 'desc' }],
        skip,
        take: q.limite,
      }),
      prisma.observabilidadeEvento.count({ where }),
    ]);
    return ok(
      reply,
      rows.map((r) => ({
        id: r.id,
        eventId: r.eventId,
        tenantId: r.tenantId,
        categoria: r.categoria,
        subcategoria: r.subcategoria,
        nomeEvento: r.nomeEvento,
        severidade: r.severidade,
        resultado: r.resultado,
        origemTipo: r.origemTipo,
        origemChave: r.origemChave,
        modulo: r.modulo,
        entidadeTipo: r.entidadeTipo,
        entidadeId: r.entidadeId,
        actorTipo: r.actorTipo,
        actorUserId: r.actorUserId,
        actorEmail: r.actorEmail,
        targetTipo: r.targetTipo,
        targetId: r.targetId,
        requestId: r.requestId,
        correlationId: r.correlationId,
        sessionId: r.sessionId,
        traceId: r.traceId,
        ip: r.ip,
        userAgent: r.userAgent,
        rota: r.rota,
        metodoHttp: r.metodoHttp,
        statusHttp: r.statusHttp,
        payloadRedacted: (r as any).payloadRedactedJson as any,
        labels: (r as any).labelsJson as any,
        ocorridoEm: r.ocorridoEm.toISOString(),
      })),
      { meta: { pagina: q.pagina, limite: q.limite, total } }
    );
  });

  server.get('/eventos/:id', async (request, reply) => {
    const ctx = getAuthContext(request);
    if (!ctx) return fail(reply, 401, 'Não autenticado');
    if (ctx.isSystemAdmin) return fail(reply, 403, 'Tenant não selecionado');
    const { id } = z.object({ id: z.coerce.number().int() }).parse(request.params || {});
    const ev = await prisma.observabilidadeEvento.findUnique({ where: { id } }).catch(() => null);
    if (!ev || ev.tenantId !== ctx.tenantId) return fail(reply, 404, 'Evento não encontrado');
    return ok(reply, {
      id: ev.id,
      eventId: ev.eventId,
      tenantId: ev.tenantId,
      categoria: ev.categoria,
      subcategoria: ev.subcategoria,
      nomeEvento: ev.nomeEvento,
      severidade: ev.severidade,
      resultado: ev.resultado,
      origemTipo: ev.origemTipo,
      origemChave: ev.origemChave,
      modulo: ev.modulo,
      entidadeTipo: ev.entidadeTipo,
      entidadeId: ev.entidadeId,
      actorTipo: ev.actorTipo,
      actorUserId: ev.actorUserId,
      actorEmail: ev.actorEmail,
      targetTipo: ev.targetTipo,
      targetId: ev.targetId,
      requestId: ev.requestId,
      correlationId: ev.correlationId,
      sessionId: ev.sessionId,
      traceId: ev.traceId,
      ip: ev.ip,
      userAgent: ev.userAgent,
      rota: ev.rota,
      metodoHttp: ev.metodoHttp,
      statusHttp: ev.statusHttp,
      payloadRedacted: (ev as any).payloadRedactedJson as any,
      labels: (ev as any).labelsJson as any,
      ocorridoEm: ev.ocorridoEm.toISOString(),
    });
  });

  server.get('/alertas', async (request, reply) => {
    const ctx = getAuthContext(request);
    if (!ctx) return fail(reply, 401, 'Não autenticado');
    if (ctx.isSystemAdmin) return fail(reply, 403, 'Tenant não selecionado');
    const q = z
      .object({
        status: z.string().optional(),
        pagina: z.coerce.number().int().min(1).default(1),
        limite: z.coerce.number().int().min(1).max(100).default(30),
      })
      .parse(request.query || {});
    const where: any = { tenantId: ctx.tenantId };
    if (q.status) where.statusAlerta = String(q.status).toUpperCase();
    const skip = (q.pagina - 1) * q.limite;
    const [rows, total] = await Promise.all([
      prisma.observabilidadeAlerta.findMany({ where, orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }], skip, take: q.limite }),
      prisma.observabilidadeAlerta.count({ where }),
    ]);
    return ok(reply, rows, { meta: { pagina: q.pagina, limite: q.limite, total } });
  });

  server.get('/incidentes', async (request, reply) => {
    const ctx = getAuthContext(request);
    if (!ctx) return fail(reply, 401, 'Não autenticado');
    if (ctx.isSystemAdmin) return fail(reply, 403, 'Tenant não selecionado');
    const q = z
      .object({
        status: z.string().optional(),
        pagina: z.coerce.number().int().min(1).default(1),
        limite: z.coerce.number().int().min(1).max(100).default(30),
      })
      .parse(request.query || {});
    const where: any = { tenantId: ctx.tenantId };
    if (q.status) where.statusIncidente = String(q.status).toUpperCase();
    const skip = (q.pagina - 1) * q.limite;
    const [rows, total] = await Promise.all([
      prisma.observabilidadeIncidente.findMany({ where, orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }], skip, take: q.limite }),
      prisma.observabilidadeIncidente.count({ where }),
    ]);
    return ok(reply, rows, { meta: { pagina: q.pagina, limite: q.limite, total } });
  });

  server.get('/incidentes/:id', async (request, reply) => {
    const ctx = getAuthContext(request);
    if (!ctx) return fail(reply, 401, 'Não autenticado');
    if (ctx.isSystemAdmin) return fail(reply, 403, 'Tenant não selecionado');
    const { id } = z.object({ id: z.coerce.number().int() }).parse(request.params || {});
    const inc = await prisma.observabilidadeIncidente.findUnique({ where: { id } }).catch(() => null);
    if (!inc || inc.tenantId !== ctx.tenantId) return fail(reply, 404, 'Incidente não encontrado');
    return ok(reply, inc);
  });

  server.get('/regras', async (request, reply) => {
    const ctx = getAuthContext(request);
    if (!ctx) return fail(reply, 401, 'Não autenticado');
    if (ctx.isSystemAdmin) return fail(reply, 403, 'Tenant não selecionado');
    const q = z
      .object({
        ativo: z.string().optional(),
        pagina: z.coerce.number().int().min(1).default(1),
        limite: z.coerce.number().int().min(1).max(100).default(30),
      })
      .parse(request.query || {});
    const where: any = { tenantId: ctx.tenantId };
    if (q.ativo) where.ativo = String(q.ativo).toLowerCase() === 'true';
    const skip = (q.pagina - 1) * q.limite;
    const [rows, total] = await Promise.all([
      prisma.observabilidadeRegra.findMany({ where, orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }], skip, take: q.limite }),
      prisma.observabilidadeRegra.count({ where }),
    ]);
    return ok(reply, rows, { meta: { pagina: q.pagina, limite: q.limite, total } });
  });
}
