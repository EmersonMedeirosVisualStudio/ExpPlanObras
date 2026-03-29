import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import crypto from 'crypto';
import prisma from '../../plugins/prisma.js';
import { authenticate } from '../../utils/authenticate.js';
import { auditRetencao } from './audit.js';
import { simularDescarte, criarLoteDescarte, aprovarLote, executarLote } from './disposal.js';
import { aplicarLegalHoldEmItem, aplicarLegalHoldPorCriteria, liberarLegalHold } from './legal-hold.js';
import { listRetentionResources } from './registry.js';
import { sincronizarItemRetencao } from './policy-engine.js';

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

async function requireRetencaoAdmin(request: FastifyRequest, reply: FastifyReply) {
  const ctx = getAuthContext(request);
  if (!ctx) return fail(reply, 401, 'Não autenticado');
  if (ctx.isSystemAdmin) return ctx;
  const tenantUser = await prisma.tenantUser.findUnique({
    where: { tenantId_userId: { tenantId: ctx.tenantId, userId: ctx.userId } },
    select: { role: true },
  });
  if (!tenantUser) return fail(reply, 403, 'Tenant não selecionado');
  if (tenantUser.role === 'ADMIN') return ctx;
  return fail(reply, 403, 'Acesso negado');
}

function normResource(v: unknown) {
  return String(v || '').trim().toUpperCase();
}

export default async function retencaoRoutes(server: FastifyInstance) {
  server.addHook('onRequest', authenticate);

  server.get('/recursos', async (request, reply) => {
    const ctx = await requireRetencaoAdmin(request, reply);
    if (!ctx || (ctx as any).success === false) return;
    return ok(reply, listRetentionResources());
  });

  server.post(
    '/inventario/sincronizar',
    {
      schema: {
        body: z.object({
          recurso: z.string().optional().nullable(),
          entidadeId: z.number().int().optional().nullable(),
          limite: z.number().int().min(1).max(5000).default(500),
        }),
      },
    },
    async (request, reply) => {
      const ctx = await requireRetencaoAdmin(request, reply);
      if (!ctx || (ctx as any).success === false) return;
      if (ctx.isSystemAdmin) return fail(reply, 403, 'Tenant não selecionado');
      const body = request.body as any;
      const recurso = body.recurso ? normResource(body.recurso) : null;
      const limite = Number(body.limite || 500);
      const entidadeId = typeof body.entidadeId === 'number' ? body.entidadeId : null;

      const recursos = recurso ? [recurso] : listRetentionResources();
      let processed = 0;
      let okCount = 0;
      let failCount = 0;

      for (const r of recursos) {
        const ids: number[] = [];
        if (entidadeId) ids.push(entidadeId);
        else {
          if (r === 'DOCUMENTO') {
            const rows = await prisma.documento.findMany({ where: { tenantId: ctx.tenantId }, select: { id: true }, take: limite, orderBy: { id: 'desc' } });
            ids.push(...rows.map((x) => x.id));
          } else if (r === 'DOCUMENTO_VERSAO') {
            const rows = await prisma.documentoVersao.findMany({ where: { tenantId: ctx.tenantId }, select: { id: true }, take: limite, orderBy: { id: 'desc' } });
            ids.push(...rows.map((x) => x.id));
          } else if (r === 'ASSINATURA_ARTEFATO') {
            const rows = await prisma.documentoAssinaturaArtefato.findMany({ where: { tenantId: ctx.tenantId }, select: { id: true }, take: limite, orderBy: { id: 'desc' } });
            ids.push(...rows.map((x) => x.id));
          }
        }

        for (const id of ids) {
          processed++;
          const res = await sincronizarItemRetencao({ tenantId: ctx.tenantId, recurso: r, entidadeId: id });
          if (res.ok) okCount++;
          else failCount++;
        }
      }

      await auditRetencao({
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        recurso: 'RETENCAO',
        tipoEvento: 'INVENTARIO_SINCRONIZADO',
        descricaoEvento: 'Inventário sincronizado',
        metadataJson: { recurso: recurso || 'ALL', processed, okCount, failCount },
      });

      return ok(reply, { processed, okCount, failCount }, { message: 'Sincronização concluída' });
    }
  );

  server.get('/politicas', async (request, reply) => {
    const ctx = await requireRetencaoAdmin(request, reply);
    if (!ctx || (ctx as any).success === false) return;
    if (ctx.isSystemAdmin) return fail(reply, 403, 'Tenant não selecionado');

    const q = z
      .object({
        recurso: z.string().optional(),
        ativo: z.enum(['true', 'false']).optional(),
        pagina: z.coerce.number().int().min(1).default(1),
        limite: z.coerce.number().int().min(1).max(100).default(30),
      })
      .parse(request.query || {});

    const where: any = { tenantId: ctx.tenantId };
    if (q.recurso) where.recurso = normResource(q.recurso);
    if (q.ativo === 'true') where.ativo = true;
    if (q.ativo === 'false') where.ativo = false;

    const skip = (q.pagina - 1) * q.limite;
    const [rows, total] = await Promise.all([
      prisma.governancaRetencaoPolitica.findMany({
        where,
        orderBy: [{ prioridade: 'desc' }, { id: 'desc' }],
        skip,
        take: q.limite,
      }),
      prisma.governancaRetencaoPolitica.count({ where }),
    ]);
    return ok(reply, rows, { meta: { pagina: q.pagina, limite: q.limite, total } });
  });

  server.post(
    '/politicas',
    {
      schema: {
        body: z.object({
          codigoPolitica: z.string().min(2),
          nomePolitica: z.string().min(2),
          recurso: z.string().min(2),
          categoriaRecurso: z.string().optional().nullable(),
          eventoBase: z.string().min(2),
          periodoValor: z.number().int().min(1),
          periodoUnidade: z.enum(['DIAS', 'MESES', 'ANOS']),
          acaoFinal: z.string().min(2),
          exigeAprovacaoDescarte: z.boolean().default(true),
          respeitaBackupTtl: z.boolean().default(true),
          anonimizarCamposJson: z.unknown().optional().nullable(),
          condicaoJson: z.unknown().optional().nullable(),
          prioridade: z.number().int().min(0).max(1000).default(0),
          ativo: z.boolean().default(true),
        }),
      },
    },
    async (request, reply) => {
      const ctx = await requireRetencaoAdmin(request, reply);
      if (!ctx || (ctx as any).success === false) return;
      if (ctx.isSystemAdmin) return fail(reply, 403, 'Tenant não selecionado');
      const body = request.body as any;

      const created = await prisma.governancaRetencaoPolitica.create({
        data: {
          tenantId: ctx.tenantId,
          codigoPolitica: String(body.codigoPolitica).toUpperCase(),
          nomePolitica: String(body.nomePolitica),
          recurso: normResource(body.recurso),
          categoriaRecurso: body.categoriaRecurso ?? null,
          eventoBase: String(body.eventoBase).toUpperCase(),
          periodoValor: Number(body.periodoValor),
          periodoUnidade: String(body.periodoUnidade),
          acaoFinal: String(body.acaoFinal).toUpperCase(),
          exigeAprovacaoDescarte: body.exigeAprovacaoDescarte !== false,
          respeitaBackupTtl: body.respeitaBackupTtl !== false,
          anonimizarCamposJson: body.anonimizarCamposJson ?? null,
          condicaoJson: body.condicaoJson ?? null,
          prioridade: Number(body.prioridade || 0),
          ativo: body.ativo !== false,
          criadoPorUserId: ctx.userId,
          atualizadoPorUserId: ctx.userId,
        },
      });

      await auditRetencao({
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        recurso: created.recurso,
        tipoEvento: 'POLITICA_APLICADA',
        descricaoEvento: `Política criada (${created.codigoPolitica})`,
        metadataJson: { politicaId: created.id },
      });

      return ok(reply, { id: created.id }, { message: 'Política criada' });
    }
  );

  server.put(
    '/politicas/:id',
    {
      schema: {
        params: z.object({ id: z.coerce.number().int() }),
        body: z.object({
          nomePolitica: z.string().min(2),
          categoriaRecurso: z.string().optional().nullable(),
          eventoBase: z.string().min(2),
          periodoValor: z.number().int().min(1),
          periodoUnidade: z.enum(['DIAS', 'MESES', 'ANOS']),
          acaoFinal: z.string().min(2),
          exigeAprovacaoDescarte: z.boolean().default(true),
          respeitaBackupTtl: z.boolean().default(true),
          anonimizarCamposJson: z.unknown().optional().nullable(),
          condicaoJson: z.unknown().optional().nullable(),
          prioridade: z.number().int().min(0).max(1000).default(0),
          ativo: z.boolean().default(true),
        }),
      },
    },
    async (request, reply) => {
      const ctx = await requireRetencaoAdmin(request, reply);
      if (!ctx || (ctx as any).success === false) return;
      if (ctx.isSystemAdmin) return fail(reply, 403, 'Tenant não selecionado');

      const { id } = request.params as any;
      const body = request.body as any;
      const current = await prisma.governancaRetencaoPolitica.findUnique({ where: { id: Number(id) } }).catch(() => null);
      if (!current || current.tenantId !== ctx.tenantId) return fail(reply, 404, 'Política não encontrada');

      const updated = await prisma.governancaRetencaoPolitica.update({
        where: { id: Number(id) },
        data: {
          nomePolitica: String(body.nomePolitica),
          categoriaRecurso: body.categoriaRecurso ?? null,
          eventoBase: String(body.eventoBase).toUpperCase(),
          periodoValor: Number(body.periodoValor),
          periodoUnidade: String(body.periodoUnidade),
          acaoFinal: String(body.acaoFinal).toUpperCase(),
          exigeAprovacaoDescarte: body.exigeAprovacaoDescarte !== false,
          respeitaBackupTtl: body.respeitaBackupTtl !== false,
          anonimizarCamposJson: body.anonimizarCamposJson ?? null,
          condicaoJson: body.condicaoJson ?? null,
          prioridade: Number(body.prioridade || 0),
          ativo: body.ativo !== false,
          atualizadoPorUserId: ctx.userId,
        },
      });

      await auditRetencao({
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        recurso: updated.recurso,
        tipoEvento: 'POLITICA_APLICADA',
        descricaoEvento: `Política atualizada (${updated.codigoPolitica})`,
        metadataJson: { politicaId: updated.id },
      });

      return ok(reply, { id: updated.id }, { message: 'Política atualizada' });
    }
  );

  server.get('/inventario', async (request, reply) => {
    const ctx = await requireRetencaoAdmin(request, reply);
    if (!ctx || (ctx as any).success === false) return;
    if (ctx.isSystemAdmin) return fail(reply, 403, 'Tenant não selecionado');

    const q = z
      .object({
        recurso: z.string().optional(),
        status: z.string().optional(),
        holdAtivo: z.enum(['true', 'false']).optional(),
        elegivel: z.enum(['true', 'false']).optional(),
        pagina: z.coerce.number().int().min(1).default(1),
        limite: z.coerce.number().int().min(1).max(100).default(30),
      })
      .parse(request.query || {});

    const where: any = { tenantId: ctx.tenantId };
    if (q.recurso) where.recurso = normResource(q.recurso);
    if (q.status) where.statusRetencao = String(q.status).toUpperCase();
    if (q.holdAtivo === 'true') where.holdAtivo = true;
    if (q.holdAtivo === 'false') where.holdAtivo = false;
    if (q.elegivel === 'true') where.elegivelDescarteEm = { lte: new Date() };
    if (q.elegivel === 'false') where.OR = [{ elegivelDescarteEm: null }, { elegivelDescarteEm: { gt: new Date() } }];

    const skip = (q.pagina - 1) * q.limite;
    const [rows, total] = await Promise.all([
      prisma.governancaRetencaoItem.findMany({ where, orderBy: [{ elegivelDescarteEm: 'asc' }, { id: 'asc' }], skip, take: q.limite }),
      prisma.governancaRetencaoItem.count({ where }),
    ]);
    return ok(reply, rows, { meta: { pagina: q.pagina, limite: q.limite, total } });
  });

  server.get('/legal-holds', async (request, reply) => {
    const ctx = await requireRetencaoAdmin(request, reply);
    if (!ctx || (ctx as any).success === false) return;
    if (ctx.isSystemAdmin) return fail(reply, 403, 'Tenant não selecionado');
    const rows = await prisma.governancaLegalHold.findMany({ where: { tenantId: ctx.tenantId }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] });
    return ok(reply, rows);
  });

  server.post(
    '/legal-holds',
    {
      schema: {
        body: z.object({
          codigoHold: z.string().min(2).optional().nullable(),
          tituloHold: z.string().min(2),
          motivoHold: z.string().min(5),
          tipoHold: z.string().min(2),
          criteriaJson: z.unknown().optional().nullable(),
        }),
      },
    },
    async (request, reply) => {
      const ctx = await requireRetencaoAdmin(request, reply);
      if (!ctx || (ctx as any).success === false) return;
      if (ctx.isSystemAdmin) return fail(reply, 403, 'Tenant não selecionado');
      const body = request.body as any;
      const codigoHold = body.codigoHold ? String(body.codigoHold).toUpperCase() : `HOLD_${crypto.randomBytes(6).toString('hex').toUpperCase()}`;

      const created = await prisma.governancaLegalHold.create({
        data: {
          tenantId: ctx.tenantId,
          codigoHold,
          tituloHold: String(body.tituloHold),
          motivoHold: String(body.motivoHold),
          tipoHold: String(body.tipoHold).toUpperCase(),
          statusHold: 'ATIVO',
          criteriaJson: body.criteriaJson ?? null,
          criadorUserId: ctx.userId,
        },
      });

      let applied = 0;
      if (created.criteriaJson) {
        const r = await aplicarLegalHoldPorCriteria({ tenantId: ctx.tenantId, userId: ctx.userId, legalHoldId: created.id, criteriaJson: created.criteriaJson });
        applied = r.applied;
      }

      await auditRetencao({
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        recurso: 'RETENCAO',
        tipoEvento: 'HOLD_APLICADO',
        descricaoEvento: `Legal hold criado (${created.codigoHold})`,
        metadataJson: { legalHoldId: created.id, applied },
      });

      return ok(reply, { id: created.id, applied }, { message: 'Legal hold criado' });
    }
  );

  server.post('/legal-holds/:id/aplicar', { schema: { params: z.object({ id: z.coerce.number().int() }), body: z.object({ retencaoItemId: z.number().int() }) } }, async (request, reply) => {
    const ctx = await requireRetencaoAdmin(request, reply);
    if (!ctx || (ctx as any).success === false) return;
    if (ctx.isSystemAdmin) return fail(reply, 403, 'Tenant não selecionado');
    const { id } = request.params as any;
    const body = request.body as any;
    const hold = await prisma.governancaLegalHold.findUnique({ where: { id: Number(id) } }).catch(() => null);
    if (!hold || hold.tenantId !== ctx.tenantId) return fail(reply, 404, 'Hold não encontrado');
    const r = await aplicarLegalHoldEmItem({ tenantId: ctx.tenantId, userId: ctx.userId, legalHoldId: hold.id, retencaoItemId: Number(body.retencaoItemId) });
    if (!r.ok) return fail(reply, 400, r.reason);
    return ok(reply, { ok: true }, { message: 'Hold aplicado' });
  });

  server.post('/legal-holds/:id/liberar', async (request, reply) => {
    const ctx = await requireRetencaoAdmin(request, reply);
    if (!ctx || (ctx as any).success === false) return;
    if (ctx.isSystemAdmin) return fail(reply, 403, 'Tenant não selecionado');
    const { id } = z.object({ id: z.coerce.number().int() }).parse(request.params || {});
    const r = await liberarLegalHold({ tenantId: ctx.tenantId, userId: ctx.userId, legalHoldId: id });
    if (!r.ok) return fail(reply, 400, r.reason);
    return ok(reply, { ok: true }, { message: 'Hold liberado' });
  });

  server.post(
    '/descarte/simular',
    {
      schema: {
        body: z.object({
          recurso: z.string().optional().nullable(),
          elegivelAte: z.string().optional().nullable(),
          incluirHold: z.boolean().default(false),
        }),
      },
    },
    async (request, reply) => {
      const ctx = await requireRetencaoAdmin(request, reply);
      if (!ctx || (ctx as any).success === false) return;
      if (ctx.isSystemAdmin) return fail(reply, 403, 'Tenant não selecionado');
      const body = request.body as any;
      const elegivelAte = body.elegivelAte ? new Date(String(body.elegivelAte)) : new Date();
      const result = await simularDescarte({ tenantId: ctx.tenantId, filtro: { recurso: body.recurso ? normResource(body.recurso) : undefined, elegivelAte, incluirHold: Boolean(body.incluirHold) } });
      return ok(reply, result);
    }
  );

  server.get('/descarte/lotes', async (request, reply) => {
    const ctx = await requireRetencaoAdmin(request, reply);
    if (!ctx || (ctx as any).success === false) return;
    if (ctx.isSystemAdmin) return fail(reply, 403, 'Tenant não selecionado');
    const rows = await prisma.governancaDescarteLote.findMany({ where: { tenantId: ctx.tenantId }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 100 });
    return ok(reply, rows);
  });

  server.post(
    '/descarte/lotes',
    {
      schema: {
        body: z.object({
          nomeLote: z.string().min(2),
          tipoExecucao: z.enum(['SIMULACAO', 'REAL']),
          recurso: z.string().optional().nullable(),
          elegivelAte: z.string().optional().nullable(),
          incluirHold: z.boolean().default(false),
        }),
      },
    },
    async (request, reply) => {
      const ctx = await requireRetencaoAdmin(request, reply);
      if (!ctx || (ctx as any).success === false) return;
      if (ctx.isSystemAdmin) return fail(reply, 403, 'Tenant não selecionado');
      const body = request.body as any;
      const elegivelAte = body.elegivelAte ? new Date(String(body.elegivelAte)) : new Date();
      const id = await criarLoteDescarte({
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        nomeLote: String(body.nomeLote),
        tipoExecucao: body.tipoExecucao,
        filtro: { recurso: body.recurso ? normResource(body.recurso) : undefined, elegivelAte, incluirHold: Boolean(body.incluirHold) },
      });
      return ok(reply, { id }, { message: 'Lote criado' });
    }
  );

  server.get('/descarte/lotes/:id', async (request, reply) => {
    const ctx = await requireRetencaoAdmin(request, reply);
    if (!ctx || (ctx as any).success === false) return;
    if (ctx.isSystemAdmin) return fail(reply, 403, 'Tenant não selecionado');
    const { id } = z.object({ id: z.coerce.number().int() }).parse(request.params || {});
    const lote = await prisma.governancaDescarteLote.findUnique({ where: { id } }).catch(() => null);
    if (!lote || lote.tenantId !== ctx.tenantId) return fail(reply, 404, 'Lote não encontrado');
    const itens = await prisma.governancaDescarteLoteItem.findMany({ where: { tenantId: ctx.tenantId, loteId: lote.id }, orderBy: [{ id: 'asc' }], take: 5000 });
    return ok(reply, { lote, itens });
  });

  server.post('/descarte/lotes/:id/aprovar', async (request, reply) => {
    const ctx = await requireRetencaoAdmin(request, reply);
    if (!ctx || (ctx as any).success === false) return;
    if (ctx.isSystemAdmin) return fail(reply, 403, 'Tenant não selecionado');
    const { id } = z.object({ id: z.coerce.number().int() }).parse(request.params || {});
    const r = await aprovarLote({ tenantId: ctx.tenantId, userId: ctx.userId, loteId: id });
    if (!r.ok) return fail(reply, 400, r.reason);
    return ok(reply, { ok: true }, { message: 'Lote aprovado' });
  });

  server.post('/descarte/lotes/:id/executar', async (request, reply) => {
    const ctx = await requireRetencaoAdmin(request, reply);
    if (!ctx || (ctx as any).success === false) return;
    if (ctx.isSystemAdmin) return fail(reply, 403, 'Tenant não selecionado');
    const { id } = z.object({ id: z.coerce.number().int() }).parse(request.params || {});
    const r = await executarLote({ tenantId: ctx.tenantId, userId: ctx.userId, loteId: id });
    if (!r.ok) return fail(reply, 400, r.reason);
    return ok(reply, r, { message: 'Lote executado' });
  });

  server.get('/auditoria', async (request, reply) => {
    const ctx = await requireRetencaoAdmin(request, reply);
    if (!ctx || (ctx as any).success === false) return;
    if (ctx.isSystemAdmin) return fail(reply, 403, 'Tenant não selecionado');
    const q = z
      .object({
        recurso: z.string().optional(),
        tipoEvento: z.string().optional(),
        pagina: z.coerce.number().int().min(1).default(1),
        limite: z.coerce.number().int().min(1).max(100).default(50),
      })
      .parse(request.query || {});
    const where: any = { tenantId: ctx.tenantId };
    if (q.recurso) where.recurso = normResource(q.recurso);
    if (q.tipoEvento) where.tipoEvento = String(q.tipoEvento).toUpperCase();
    const skip = (q.pagina - 1) * q.limite;
    const [rows, total] = await Promise.all([
      prisma.governancaRetencaoAuditoria.findMany({ where, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip, take: q.limite }),
      prisma.governancaRetencaoAuditoria.count({ where }),
    ]);
    return ok(reply, rows, { meta: { pagina: q.pagina, limite: q.limite, total } });
  });
}

