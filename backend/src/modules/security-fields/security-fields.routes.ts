import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import prisma from '../../plugins/prisma.js';
import { authenticate } from '../../utils/authenticate.js';
import { evaluateFieldDecision, loadSubjectContext } from './service.js';
import { sanitizeResourceObject } from './sanitizer.js';
import { getCatalogForResource } from './catalog.js';

type ApiSuccess<T> = { success: true; message?: string; data: T; meta?: any };
type ApiError = { success: false; message: string; errors?: Record<string, string[]> };

function ok<T>(reply: FastifyReply, data: T, input?: { message?: string; meta?: any }) {
  const payload: ApiSuccess<T> = { success: true, data };
  if (input?.message) payload.message = input.message;
  if (input?.meta) payload.meta = input.meta;
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

async function requireSecurityAdmin(request: FastifyRequest, reply: FastifyReply) {
  const ctx = getAuthContext(request);
  if (!ctx) return fail(reply, 401, 'Não autenticado');
  if (ctx.isSystemAdmin) {
    if (ctx.tenantId == null) return fail(reply, 403, 'Tenant não selecionado');
    return { ...ctx, tenantId: ctx.tenantId };
  }

  const tenantUser = await prisma.tenantUser.findUnique({
    where: { tenantId_userId: { tenantId: ctx.tenantId, userId: ctx.userId } },
    select: { id: true, role: true },
  });
  if (!tenantUser) return fail(reply, 403, 'Tenant não selecionado');
  if (tenantUser.role === 'ADMIN') return ctx;

  const enc = await prisma.empresaEncarregadoSistema.findFirst({
    where: { tenantId: ctx.tenantId, ativo: true },
    orderBy: { id: 'desc' },
    select: { userId: true },
  });
  if (enc?.userId === ctx.userId) return ctx;
  return fail(reply, 403, 'Acesso negado');
}

export default async function securityFieldsRoutes(server: FastifyInstance) {
  server.addHook('onRequest', authenticate);

  server.get('/policies', async (request, reply) => {
    const ctx = await requireSecurityAdmin(request, reply);
    if (!ctx || (ctx as any).success === false) return;

    const query = z
      .object({
        recurso: z.string().optional(),
        acao: z.string().optional(),
        ativo: z.enum(['true', 'false']).optional(),
        pagina: z.coerce.number().int().min(1).default(1),
        limite: z.coerce.number().int().min(1).max(100).default(50),
      })
      .parse(request.query || {});

    const where: any = { tenantId: ctx.tenantId };
    if (query.recurso) where.recurso = query.recurso;
    if (query.acao) where.acao = query.acao;
    if (query.ativo === 'true') where.ativo = true;
    if (query.ativo === 'false') where.ativo = false;

    const skip = (query.pagina - 1) * query.limite;
    const [rows, total] = await Promise.all([
      prisma.securityFieldPolicy.findMany({
        where,
        include: { alvos: true },
        orderBy: [{ recurso: 'asc' }, { acao: 'asc' }, { caminhoCampo: 'asc' }, { prioridade: 'desc' }, { id: 'desc' }],
        skip,
        take: query.limite,
      }),
      prisma.securityFieldPolicy.count({ where }),
    ]);

    return ok(reply, rows, { meta: { pagina: query.pagina, limite: query.limite, total } });
  });

  server.post(
    '/policies',
    {
      schema: {
        body: z.object({
          recurso: z.string().min(2),
          acao: z.string().min(2),
          caminhoCampo: z.string().min(1),
          efeitoCampo: z.enum(['ALLOW', 'MASK', 'HIDE', 'NULLIFY', 'TRANSFORM']),
          estrategiaMascara: z.string().optional().nullable(),
          prioridade: z.number().int().min(0).max(1000).default(0),
          condicaoJson: z.unknown().optional().nullable(),
          ativo: z.boolean().default(true),
          alvos: z
            .array(
              z.object({
                tipoAlvo: z.enum(['TODOS', 'USUARIO', 'PERFIL', 'PERMISSAO', 'ROLE']),
                userId: z.number().int().optional().nullable(),
                perfilCodigo: z.string().optional().nullable(),
                permissao: z.string().optional().nullable(),
                ativo: z.boolean().default(true),
              })
            )
            .default([]),
        }),
      },
    },
    async (request, reply) => {
      const ctx = await requireSecurityAdmin(request, reply);
      if (!ctx || (ctx as any).success === false) return;
      const body = request.body as any;

      const created = await prisma.$transaction(async (tx) => {
        const p = await tx.securityFieldPolicy.create({
          data: {
            tenantId: ctx.tenantId,
            recurso: body.recurso,
            acao: body.acao,
            caminhoCampo: body.caminhoCampo,
            efeitoCampo: body.efeitoCampo,
            estrategiaMascara: body.estrategiaMascara || null,
            prioridade: body.prioridade || 0,
            condicaoJson: body.condicaoJson ?? null,
            ativo: body.ativo !== false,
            criadoPorUserId: ctx.userId,
            atualizadoPorUserId: ctx.userId,
          },
        });
        if (Array.isArray(body.alvos) && body.alvos.length) {
          await tx.securityFieldPolicyTarget.createMany({
            data: body.alvos.map((t: any) => ({
              policyId: p.id,
              tipoAlvo: t.tipoAlvo,
              userId: typeof t.userId === 'number' ? t.userId : null,
              perfilCodigo: t.perfilCodigo ? String(t.perfilCodigo) : null,
              permissao: t.permissao ? String(t.permissao) : null,
              ativo: t.ativo !== false,
            })),
          });
        }
        return tx.securityFieldPolicy.findUnique({ where: { id: p.id }, include: { alvos: true } });
      });

      return ok(reply, created, { message: 'Política criada' });
    }
  );

  server.put(
    '/policies/:id',
    {
      schema: {
        params: z.object({ id: z.coerce.number().int() }),
        body: z.object({
          recurso: z.string().min(2),
          acao: z.string().min(2),
          caminhoCampo: z.string().min(1),
          efeitoCampo: z.enum(['ALLOW', 'MASK', 'HIDE', 'NULLIFY', 'TRANSFORM']),
          estrategiaMascara: z.string().optional().nullable(),
          prioridade: z.number().int().min(0).max(1000).default(0),
          condicaoJson: z.unknown().optional().nullable(),
          ativo: z.boolean().default(true),
          alvos: z
            .array(
              z.object({
                tipoAlvo: z.enum(['TODOS', 'USUARIO', 'PERFIL', 'PERMISSAO', 'ROLE']),
                userId: z.number().int().optional().nullable(),
                perfilCodigo: z.string().optional().nullable(),
                permissao: z.string().optional().nullable(),
                ativo: z.boolean().default(true),
              })
            )
            .default([]),
        }),
      },
    },
    async (request, reply) => {
      const ctx = await requireSecurityAdmin(request, reply);
      if (!ctx || (ctx as any).success === false) return;

      const { id } = request.params as { id: number };
      const body = request.body as any;
      const current = await prisma.securityFieldPolicy.findUnique({ where: { id } }).catch(() => null);
      if (!current || current.tenantId !== ctx.tenantId) return fail(reply, 404, 'Política não encontrada');

      const updated = await prisma.$transaction(async (tx) => {
        await tx.securityFieldPolicy.update({
          where: { id },
          data: {
            recurso: body.recurso,
            acao: body.acao,
            caminhoCampo: body.caminhoCampo,
            efeitoCampo: body.efeitoCampo,
            estrategiaMascara: body.estrategiaMascara || null,
            prioridade: body.prioridade || 0,
            condicaoJson: body.condicaoJson ?? null,
            ativo: body.ativo !== false,
            atualizadoPorUserId: ctx.userId,
          },
        });
        await tx.securityFieldPolicyTarget.deleteMany({ where: { policyId: id } });
        if (Array.isArray(body.alvos) && body.alvos.length) {
          await tx.securityFieldPolicyTarget.createMany({
            data: body.alvos.map((t: any) => ({
              policyId: id,
              tipoAlvo: t.tipoAlvo,
              userId: typeof t.userId === 'number' ? t.userId : null,
              perfilCodigo: t.perfilCodigo ? String(t.perfilCodigo) : null,
              permissao: t.permissao ? String(t.permissao) : null,
              ativo: t.ativo !== false,
            })),
          });
        }
        return tx.securityFieldPolicy.findUnique({ where: { id }, include: { alvos: true } });
      });

      return ok(reply, updated, { message: 'Política atualizada' });
    }
  );

  server.post(
    '/simulate',
    {
      schema: {
        body: z.object({
          userId: z.number().int().optional().nullable(),
          resource: z.string().min(2),
          action: z.enum(['VIEW', 'EXPORT', 'SEARCH', 'ANALYTICS']),
          entityId: z.number().int().optional().nullable(),
          sample: z.unknown(),
        }),
      },
    },
    async (request, reply) => {
      const ctx = await requireSecurityAdmin(request, reply);
      if (!ctx || (ctx as any).success === false) return;
      const body = request.body as any;
      const userId = typeof body.userId === 'number' ? body.userId : ctx.userId;
      const subject = await loadSubjectContext({ tenantId: ctx.tenantId, userId });

      const catalog = getCatalogForResource(String(body.resource));
      const fields: Record<string, any> = {};
      for (const entry of catalog) {
        const fallback = {
          effect: entry.defaultEffect || 'ALLOW',
          strategy: entry.defaultMaskStrategy ?? null,
          reason: 'CATALOG_DEFAULT',
          policyId: null,
        };
        const decision = await evaluateFieldDecision({
          subject,
          resource: String(body.resource),
          action: body.action,
          path: entry.path,
          fallback,
        });
        fields[entry.path] = decision;
      }

      const preview = await sanitizeResourceObject(
        body.sample,
        { tenantId: ctx.tenantId, userId, resource: body.resource, action: body.action, entityId: body.entityId ?? null, exportacao: body.action === 'EXPORT' },
        subject
      );
      return ok(reply, { fields, preview });
    }
  );

  server.get('/audit', async (request, reply) => {
    const ctx = await requireSecurityAdmin(request, reply);
    if (!ctx || (ctx as any).success === false) return;

    const query = z
      .object({
        recurso: z.string().optional(),
        acao: z.string().optional(),
        userId: z.coerce.number().int().optional(),
        pagina: z.coerce.number().int().min(1).default(1),
        limite: z.coerce.number().int().min(1).max(100).default(50),
      })
      .parse(request.query || {});

    const where: any = { tenantId: ctx.tenantId };
    if (query.recurso) where.recurso = query.recurso;
    if (query.acao) where.acao = query.acao;
    if (typeof query.userId === 'number') where.userId = query.userId;

    const skip = (query.pagina - 1) * query.limite;
    const [rows, total] = await Promise.all([
      prisma.securitySensitiveDataAudit.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip,
        take: query.limite,
      }),
      prisma.securitySensitiveDataAudit.count({ where }),
    ]);

    return ok(reply, rows, { meta: { pagina: query.pagina, limite: query.limite, total } });
  });
}

