import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import prisma from '../../plugins/prisma.js';
import { authenticate } from '../../utils/authenticate.js';
import { calcularReadinessPlano } from './readiness.js';
import { emitObservabilityEvent } from '../observabilidade/emit.js';

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

function getAuthContext(request: FastifyRequest) {
  const u = request.user as any;
  const tenantId = u?.tenantId;
  const userId = u?.userId;
  const role = u?.role;
  const isSystemAdmin = Boolean(u?.isSystemAdmin);
  if (typeof userId !== 'number') return null;
  if (isSystemAdmin) return { tenantId: typeof tenantId === 'number' ? tenantId : null, userId, role: typeof role === 'string' ? role : 'SYSTEM_ADMIN', isSystemAdmin: true };
  if (typeof tenantId !== 'number') return null;
  return { tenantId, userId, role: typeof role === 'string' ? role : 'USER', isSystemAdmin: false };
}

async function requireTenant(request: FastifyRequest, reply: FastifyReply) {
  const ctx = getAuthContext(request);
  if (!ctx) return fail(reply, 401, 'Não autenticado');
  if (ctx.isSystemAdmin) return fail(reply, 403, 'Tenant não selecionado');
  return ctx;
}

export default async function continuidadeRoutes(server: FastifyInstance) {
  server.addHook('onRequest', authenticate);

  server.get('/planos', async (request, reply) => {
    const ctx = await requireTenant(request, reply);
    if (!ctx || (ctx as any).success === false) return;
    const q = z
      .object({
        tipo: z.string().optional(),
        ativo: z.string().optional(),
        pagina: z.coerce.number().int().min(1).default(1),
        limite: z.coerce.number().int().min(1).max(100).default(30),
      })
      .parse(request.query || {});
    const where: any = { tenantId: ctx.tenantId };
    if (q.tipo) where.tipoPlano = String(q.tipo).toUpperCase();
    if (q.ativo) where.ativo = String(q.ativo).toLowerCase() === 'true';
    const skip = (q.pagina - 1) * q.limite;
    const [rows, total] = await Promise.all([
      prisma.bcpPlano.findMany({ where, orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }], skip, take: q.limite }),
      prisma.bcpPlano.count({ where }),
    ]);
    return ok(reply, rows, { meta: { pagina: q.pagina, limite: q.limite, total } });
  });

  server.post(
    '/planos',
    {
      schema: {
        body: z.object({
          codigo: z.string().min(2),
          nome: z.string().min(2),
          descricao: z.string().optional().nullable(),
          tipoPlano: z.enum(['BCP', 'DR', 'CRISE']),
          modulo: z.string().optional().nullable(),
          criticidade: z.enum(['BAIXA', 'MEDIA', 'ALTA', 'CRITICA']).default('MEDIA'),
          rtoMinutos: z.number().int().min(1),
          rpoMinutos: z.number().int().min(0),
        }),
      },
    },
    async (request, reply) => {
      const ctx = await requireTenant(request, reply);
      if (!ctx || (ctx as any).success === false) return;
      const body = request.body as any;
      const created = await prisma.bcpPlano.create({
        data: {
          tenantId: ctx.tenantId,
          codigo: String(body.codigo),
          nome: String(body.nome),
          descricao: body.descricao ?? null,
          tipoPlano: String(body.tipoPlano),
          modulo: body.modulo ?? null,
          criticidade: String(body.criticidade),
          rtoMinutos: Number(body.rtoMinutos),
          rpoMinutos: Number(body.rpoMinutos),
          ownerUserId: ctx.userId,
        } as any,
      });
      await emitObservabilityEvent({
        tenantId: ctx.tenantId,
        categoria: 'SISTEMA',
        nomeEvento: 'bcp.plan.created',
        severidade: 'INFO',
        resultado: 'SUCESSO',
        origemTipo: 'INTERNAL',
        modulo: 'BCP',
        entidadeTipo: 'BCP_PLANO',
        entidadeId: created.id,
        actorUserId: ctx.userId,
        payload: { codigo: created.codigo, tipoPlano: created.tipoPlano },
      });
      return ok(reply, { id: created.id }, { message: 'Plano criado' });
    }
  );

  server.get('/planos/:id', async (request, reply) => {
    const ctx = await requireTenant(request, reply);
    if (!ctx || (ctx as any).success === false) return;
    const { id } = z.object({ id: z.coerce.number().int() }).parse(request.params || {});
    const p = await prisma.bcpPlano.findUnique({ where: { id } }).catch(() => null);
    if (!p || p.tenantId !== ctx.tenantId) return fail(reply, 404, 'Plano não encontrado');
    return ok(reply, p);
  });

  server.get('/planos/:id/readiness', async (request, reply) => {
    const ctx = await requireTenant(request, reply);
    if (!ctx || (ctx as any).success === false) return;
    const { id } = z.object({ id: z.coerce.number().int() }).parse(request.params || {});
    const res = await calcularReadinessPlano({ tenantId: ctx.tenantId, planoId: id });
    if (!res.ok) return fail(reply, 404, 'Plano não encontrado');
    return ok(reply, { score: res.score, class: res.class, componentes: res.componentes });
  });

  server.get('/dr/execucoes', async (request, reply) => {
    const ctx = await requireTenant(request, reply);
    if (!ctx || (ctx as any).success === false) return;
    const q = z
      .object({
        status: z.string().optional(),
        pagina: z.coerce.number().int().min(1).default(1),
        limite: z.coerce.number().int().min(1).max(100).default(30),
      })
      .parse(request.query || {});
    const where: any = { tenantId: ctx.tenantId };
    if (q.status) where.statusExecucao = String(q.status).toUpperCase();
    const skip = (q.pagina - 1) * q.limite;
    const [rows, total] = await Promise.all([
      prisma.drExecucaoRecuperacao.findMany({ where, orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }], skip, take: q.limite }),
      prisma.drExecucaoRecuperacao.count({ where }),
    ]);
    return ok(reply, rows, { meta: { pagina: q.pagina, limite: q.limite, total } });
  });

  server.post(
    '/dr/execucoes',
    {
      schema: {
        body: z.object({
          planoId: z.number().int(),
          origemTipo: z.string().min(2),
          referenciaOrigem: z.string().optional().nullable(),
          tipoRecuperacao: z.enum(['RESTORE_TOTAL', 'RESTORE_PARCIAL', 'VALIDACAO_RESTORE', 'FAILOVER', 'ROLLBACK']),
          aprovacaoExigida: z.boolean().optional().default(false),
        }),
      },
    },
    async (request, reply) => {
      const ctx = await requireTenant(request, reply);
      if (!ctx || (ctx as any).success === false) return;
      const body = request.body as any;
      const plano = await prisma.bcpPlano.findUnique({ where: { id: Number(body.planoId) } }).catch(() => null);
      if (!plano || plano.tenantId !== ctx.tenantId) return fail(reply, 404, 'Plano inválido');
      const status = body.aprovacaoExigida ? 'PENDENTE_APROVACAO' : 'EXECUTANDO';
      const created = await prisma.drExecucaoRecuperacao.create({
        data: {
          tenantId: ctx.tenantId,
          planoId: plano.id,
          origemTipo: String(body.origemTipo),
          referenciaOrigem: body.referenciaOrigem ?? null,
          tipoRecuperacao: String(body.tipoRecuperacao),
          statusExecucao: status,
          aprovacaoExigida: Boolean(body.aprovacaoExigida),
          iniciadoEm: body.aprovacaoExigida ? null : new Date(),
        } as any,
      });
      await emitObservabilityEvent({
        tenantId: ctx.tenantId,
        categoria: 'SISTEMA',
        nomeEvento: 'dr.recovery.started',
        severidade: 'INFO',
        resultado: 'SUCESSO',
        origemTipo: 'INTERNAL',
        modulo: 'DR',
        entidadeTipo: 'DR_EXECUCAO',
        entidadeId: created.id,
        actorUserId: ctx.userId,
        payload: { planoId: plano.id, tipoRecuperacao: body.tipoRecuperacao, aprovacaoExigida: body.aprovacaoExigida },
      });
      return ok(reply, { id: created.id }, { message: 'Execução iniciada' });
    }
  );

  server.post('/dr/execucoes/:id/aprovar', async (request, reply) => {
    const ctx = await requireTenant(request, reply);
    if (!ctx || (ctx as any).success === false) return;
    const { id } = z.object({ id: z.coerce.number().int() }).parse(request.params || {});
    const ex = await prisma.drExecucaoRecuperacao.findUnique({ where: { id } }).catch(() => null);
    if (!ex || ex.tenantId !== ctx.tenantId) return fail(reply, 404, 'Execução não encontrada');
    if (ex.statusExecucao !== 'PENDENTE_APROVACAO') return fail(reply, 400, 'Status inválido');
    await prisma.drExecucaoRecuperacao.update({ where: { id: ex.id }, data: { statusExecucao: 'EXECUTANDO', aprovadoPor: ctx.userId, iniciadoEm: new Date() } as any });
    return ok(reply, { ok: true }, { message: 'Aprovado' });
  });

  server.post(
    '/dr/execucoes/:id/concluir',
    {
      schema: {
        params: z.object({ id: z.coerce.number().int() }),
        body: z.object({
          sucesso: z.boolean().default(true),
          rtoRealMinutos: z.number().int().optional().nullable(),
          rpoRealMinutos: z.number().int().optional().nullable(),
          resultadoResumoJson: z.any().optional().nullable(),
        }),
      },
    },
    async (request, reply) => {
      const ctx = await requireTenant(request, reply);
      if (!ctx || (ctx as any).success === false) return;
      const { id } = request.params as any;
      const body = request.body as any;
      const ex = await prisma.drExecucaoRecuperacao.findUnique({ where: { id: Number(id) } }).catch(() => null);
      if (!ex || ex.tenantId !== ctx.tenantId) return fail(reply, 404, 'Execução não encontrada');
      const status = body.sucesso !== false ? 'CONCLUIDO' : 'FALHA';
      await prisma.drExecucaoRecuperacao.update({
        where: { id: ex.id },
        data: { statusExecucao: status, finalizadoEm: new Date(), rtoRealMinutos: body.rtoRealMinutos ?? null, rpoRealMinutos: body.rpoRealMinutos ?? null, resultadoResumoJson: body.resultadoResumoJson ?? null } as any,
      });
      return ok(reply, { ok: true }, { message: 'Execução concluída' });
    }
  );

  server.get('/crises', async (request, reply) => {
    const ctx = await requireTenant(request, reply);
    if (!ctx || (ctx as any).success === false) return;
    const q = z
      .object({
        status: z.string().optional(),
        pagina: z.coerce.number().int().min(1).default(1),
        limite: z.coerce.number().int().min(1).max(100).default(30),
      })
      .parse(request.query || {});
    const where: any = { tenantId: ctx.tenantId };
    if (q.status) where.statusCrise = String(q.status).toUpperCase();
    const skip = (q.pagina - 1) * q.limite;
    const [rows, total] = await Promise.all([
      prisma.criseRegistro.findMany({ where, orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }], skip, take: q.limite }),
      prisma.criseRegistro.count({ where }),
    ]);
    return ok(reply, rows, { meta: { pagina: q.pagina, limite: q.limite, total } });
  });

  server.post(
    '/crises',
    {
      schema: {
        body: z.object({
          codigo: z.string().min(2),
          titulo: z.string().min(2),
          descricao: z.string().optional().nullable(),
          tipoCrise: z.string().min(2),
          severidade: z.enum(['BAIXA', 'MEDIA', 'ALTA', 'CRITICA']).default('ALTA'),
          incidenteOrigemId: z.number().int().optional().nullable(),
          planoAcionadoId: z.number().int().optional().nullable(),
        }),
      },
    },
    async (request, reply) => {
      const ctx = await requireTenant(request, reply);
      if (!ctx || (ctx as any).success === false) return;
      const body = request.body as any;
      const created = await prisma.criseRegistro.create({
        data: {
          tenantId: ctx.tenantId,
          codigo: String(body.codigo),
          titulo: String(body.titulo),
          descricao: body.descricao ?? null,
          tipoCrise: String(body.tipoCrise),
          severidade: String(body.severidade),
          statusCrise: 'ABERTA',
          incidenteOrigemId: body.incidenteOrigemId ?? null,
          planoAcionadoId: body.planoAcionadoId ?? null,
          comandanteUserId: ctx.userId,
          abertaEm: new Date(),
        } as any,
      });
      await emitObservabilityEvent({
        tenantId: ctx.tenantId,
        categoria: 'SECURITY',
        nomeEvento: 'crisis.opened',
        severidade: 'CRITICAL',
        resultado: 'SUCESSO',
        origemTipo: 'INTERNAL',
        modulo: 'CRISIS',
        entidadeTipo: 'CRISE',
        entidadeId: created.id,
        actorUserId: ctx.userId,
        payload: { codigo: created.codigo, severidade: created.severidade },
      });
      return ok(reply, { id: created.id }, { message: 'Crise aberta' });
    }
  );
}
