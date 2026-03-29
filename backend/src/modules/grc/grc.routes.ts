import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import prisma from '../../plugins/prisma.js';
import { authenticate } from '../../utils/authenticate.js';
import { emitObservabilityEvent } from '../observabilidade/emit.js';
import { classificarScore, reduzirScorePorControles, scoreFromImpactProbability } from './score.js';

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

async function requireGrcAdmin(request: FastifyRequest, reply: FastifyReply) {
  const ctx = getAuthContext(request);
  if (!ctx) return fail(reply, 401, 'Não autenticado');
  if (ctx.isSystemAdmin) return fail(reply, 403, 'Tenant não selecionado');
  const tenantUser = await prisma.tenantUser.findUnique({ where: { tenantId_userId: { tenantId: ctx.tenantId, userId: ctx.userId } }, select: { role: true } });
  if (!tenantUser) return fail(reply, 403, 'Acesso negado');
  if (tenantUser.role === 'ADMIN') return ctx;
  return fail(reply, 403, 'Acesso negado');
}

export default async function grcRoutes(server: FastifyInstance) {
  server.addHook('onRequest', authenticate);

  server.get('/riscos', async (request, reply) => {
    const ctx = await requireGrcAdmin(request, reply);
    if (!ctx || (ctx as any).success === false) return;
    const q = z
      .object({
        status: z.string().optional(),
        categoria: z.string().optional(),
        pagina: z.coerce.number().int().min(1).default(1),
        limite: z.coerce.number().int().min(1).max(100).default(30),
      })
      .parse(request.query || {});
    const where: any = { tenantId: ctx.tenantId };
    if (q.status) where.statusRisco = String(q.status).toUpperCase();
    if (q.categoria) where.categoriaRisco = String(q.categoria).toUpperCase();
    const skip = (q.pagina - 1) * q.limite;
    const [rows, total] = await Promise.all([
      prisma.grcRisco.findMany({ where, orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }], skip, take: q.limite }),
      prisma.grcRisco.count({ where }),
    ]);
    return ok(reply, rows, { meta: { pagina: q.pagina, limite: q.limite, total } });
  });

  server.post(
    '/riscos',
    {
      schema: {
        body: z.object({
          codigo: z.string().min(2),
          titulo: z.string().min(2),
          descricao: z.string().optional().nullable(),
          categoriaRisco: z.string().min(2),
          modulo: z.string().optional().nullable(),
          processoNegocio: z.string().optional().nullable(),
          entidadeTipo: z.string().optional().nullable(),
          entidadeId: z.number().int().optional().nullable(),
          ownerUserId: z.number().int().optional().nullable(),
          statusRisco: z.enum(['ABERTO', 'MONITORANDO', 'MITIGADO', 'ACEITO', 'ENCERRADO']).default('ABERTO'),
          impacto: z.enum(['BAIXO', 'MEDIO', 'ALTO', 'CRITICO']),
          probabilidade: z.enum(['RARO', 'IMPROVAVEL', 'POSSIVEL', 'PROVAVEL', 'QUASE_CERTO']),
          apetiteScore: z.number().int().optional().nullable(),
          toleranciaScore: z.number().int().optional().nullable(),
          origemRisco: z.string().optional().nullable(),
        }),
      },
    },
    async (request, reply) => {
      const ctx = await requireGrcAdmin(request, reply);
      if (!ctx || (ctx as any).success === false) return;
      const body = request.body as any;
      const score = scoreFromImpactProbability({ impacto: body.impacto, probabilidade: body.probabilidade });
      const created = await prisma.grcRisco.create({
        data: {
          tenantId: ctx.tenantId,
          codigo: String(body.codigo).toUpperCase(),
          titulo: String(body.titulo),
          descricao: body.descricao ?? null,
          categoriaRisco: String(body.categoriaRisco).toUpperCase(),
          modulo: body.modulo ?? null,
          processoNegocio: body.processoNegocio ?? null,
          entidadeTipo: body.entidadeTipo ?? null,
          entidadeId: body.entidadeId ?? null,
          ownerUserId: typeof body.ownerUserId === 'number' ? body.ownerUserId : ctx.userId,
          statusRisco: String(body.statusRisco),
          impactoInerente: String(body.impacto),
          probabilidadeInerente: String(body.probabilidade),
          scoreInerente: score,
          impactoResidual: null,
          probabilidadeResidual: null,
          scoreResidual: null,
          apetiteScore: body.apetiteScore ?? null,
          toleranciaScore: body.toleranciaScore ?? null,
          origemRisco: body.origemRisco ?? null,
        } as any,
      });
      await prisma.grcRiscoAvaliacao.create({
        data: {
          tenantId: ctx.tenantId,
          riscoId: created.id,
          tipoAvaliacao: 'INICIAL',
          impacto: String(body.impacto),
          probabilidade: String(body.probabilidade),
          score,
          justificativa: null,
          avaliadoPor: ctx.userId,
        } as any,
      });
      await emitObservabilityEvent({
        tenantId: ctx.tenantId,
        categoria: 'SECURITY',
        nomeEvento: 'grc.risk.created',
        severidade: score >= 17 ? 'CRITICAL' : score >= 10 ? 'ERROR' : 'INFO',
        resultado: 'SUCESSO',
        origemTipo: 'INTERNAL',
        modulo: 'GRC',
        entidadeTipo: 'GRC_RISCO',
        entidadeId: created.id,
        actorUserId: ctx.userId,
        payload: { codigo: created.codigo, scoreInerente: score, classe: classificarScore(score), categoriaRisco: created.categoriaRisco },
      });
      return ok(reply, { id: created.id }, { message: 'Risco criado' });
    }
  );

  server.put(
    '/riscos/:id',
    {
      schema: {
        params: z.object({ id: z.coerce.number().int() }),
        body: z.object({
          titulo: z.string().optional(),
          descricao: z.string().optional().nullable(),
          statusRisco: z.string().optional(),
          ownerUserId: z.number().int().optional().nullable(),
          apetiteScore: z.number().int().optional().nullable(),
          toleranciaScore: z.number().int().optional().nullable(),
        }),
      },
    },
    async (request, reply) => {
      const ctx = await requireGrcAdmin(request, reply);
      if (!ctx || (ctx as any).success === false) return;
      const { id } = request.params as any;
      const body = request.body as any;
      const risco = await prisma.grcRisco.findUnique({ where: { id: Number(id) } }).catch(() => null);
      if (!risco || risco.tenantId !== ctx.tenantId) return fail(reply, 404, 'Risco não encontrado');
      await prisma.grcRisco.update({
        where: { id: risco.id },
        data: {
          titulo: body.titulo != null ? String(body.titulo) : undefined,
          descricao: body.descricao !== undefined ? body.descricao : undefined,
          statusRisco: body.statusRisco != null ? String(body.statusRisco).toUpperCase() : undefined,
          ownerUserId: body.ownerUserId !== undefined ? body.ownerUserId : undefined,
          apetiteScore: body.apetiteScore !== undefined ? body.apetiteScore : undefined,
          toleranciaScore: body.toleranciaScore !== undefined ? body.toleranciaScore : undefined,
        } as any,
      });
      return ok(reply, { ok: true }, { message: 'Risco atualizado' });
    }
  );

  server.get('/riscos/:id/avaliacoes', async (request, reply) => {
    const ctx = await requireGrcAdmin(request, reply);
    if (!ctx || (ctx as any).success === false) return;
    const { id } = z.object({ id: z.coerce.number().int() }).parse(request.params || {});
    const risco = await prisma.grcRisco.findUnique({ where: { id } }).catch(() => null);
    if (!risco || risco.tenantId !== ctx.tenantId) return fail(reply, 404, 'Risco não encontrado');
    const rows = await prisma.grcRiscoAvaliacao.findMany({ where: { tenantId: ctx.tenantId, riscoId: id }, orderBy: [{ avaliadoEm: 'desc' }, { id: 'desc' }] });
    return ok(reply, rows);
  });

  server.post(
    '/riscos/:id/avaliacoes',
    {
      schema: {
        params: z.object({ id: z.coerce.number().int() }),
        body: z.object({
          tipoAvaliacao: z.enum(['INICIAL', 'PERIODICA', 'POS_INCIDENTE', 'POS_AUDITORIA', 'POS_REMEDIACAO']).default('PERIODICA'),
          impacto: z.enum(['BAIXO', 'MEDIO', 'ALTO', 'CRITICO']),
          probabilidade: z.enum(['RARO', 'IMPROVAVEL', 'POSSIVEL', 'PROVAVEL', 'QUASE_CERTO']),
          justificativa: z.string().optional().nullable(),
          aplicarComoResidual: z.boolean().default(true),
        }),
      },
    },
    async (request, reply) => {
      const ctx = await requireGrcAdmin(request, reply);
      if (!ctx || (ctx as any).success === false) return;
      const { id } = request.params as any;
      const body = request.body as any;
      const risco = await prisma.grcRisco.findUnique({ where: { id: Number(id) } }).catch(() => null);
      if (!risco || risco.tenantId !== ctx.tenantId) return fail(reply, 404, 'Risco não encontrado');
      const score = scoreFromImpactProbability({ impacto: body.impacto, probabilidade: body.probabilidade });
      await prisma.$transaction(async (tx) => {
        await tx.grcRiscoAvaliacao.create({
          data: {
            tenantId: ctx.tenantId,
            riscoId: risco.id,
            tipoAvaliacao: String(body.tipoAvaliacao),
            impacto: String(body.impacto),
            probabilidade: String(body.probabilidade),
            score,
            justificativa: body.justificativa ?? null,
            avaliadoPor: ctx.userId,
          } as any,
        });
        if (body.aplicarComoResidual !== false) {
          await tx.grcRisco.update({
            where: { id: risco.id },
            data: { impactoResidual: String(body.impacto), probabilidadeResidual: String(body.probabilidade), scoreResidual: score } as any,
          });
        }
      });
      await emitObservabilityEvent({
        tenantId: ctx.tenantId,
        categoria: 'SECURITY',
        nomeEvento: 'grc.risk.assessed',
        severidade: score >= 17 ? 'CRITICAL' : score >= 10 ? 'ERROR' : 'INFO',
        resultado: 'SUCESSO',
        origemTipo: 'INTERNAL',
        modulo: 'GRC',
        entidadeTipo: 'GRC_RISCO',
        entidadeId: risco.id,
        actorUserId: ctx.userId,
        payload: { tipoAvaliacao: body.tipoAvaliacao, score, classe: classificarScore(score) },
      });
      return ok(reply, { ok: true, score }, { message: 'Avaliação registrada' });
    }
  );

  server.post('/riscos/:id/recalcular', async (request, reply) => {
    const ctx = await requireGrcAdmin(request, reply);
    if (!ctx || (ctx as any).success === false) return;
    const { id } = z.object({ id: z.coerce.number().int() }).parse(request.params || {});
    const risco = await prisma.grcRisco.findUnique({ where: { id } }).catch(() => null);
    if (!risco || risco.tenantId !== ctx.tenantId) return fail(reply, 404, 'Risco não encontrado');
    const links = await prisma.grcRiscoControle.findMany({ where: { tenantId: ctx.tenantId, riscoId: id } });
    let efetividade = 0;
    for (const l of links) {
      const last = await prisma.grcControleTeste.findFirst({ where: { tenantId: ctx.tenantId, controleId: l.controleId }, orderBy: [{ executadoEm: 'desc' }, { id: 'desc' }] });
      const eff = typeof last?.efetividadeScore === 'number' ? last.efetividadeScore : last?.resultadoTeste === 'EFETIVO' ? 80 : last?.resultadoTeste === 'PARCIALMENTE_EFETIVO' ? 40 : 0;
      efetividade += eff * Math.max(1, l.pesoMitigacao);
    }
    const pesoTotal = links.reduce((acc, l) => acc + Math.max(1, l.pesoMitigacao), 0);
    const efetividadePonderada = pesoTotal ? Math.round(efetividade / pesoTotal) : 0;
    const { residual } = reduzirScorePorControles({ scoreInerente: risco.scoreInerente, efetividadePonderada });
    await prisma.grcRisco.update({
      where: { id: risco.id },
      data: { scoreResidual: residual, impactoResidual: risco.impactoResidual ?? risco.impactoInerente, probabilidadeResidual: risco.probabilidadeResidual ?? risco.probabilidadeInerente } as any,
    });
    return ok(reply, { ok: true, scoreResidual: residual, efetividadePonderada });
  });

  server.get('/controles', async (request, reply) => {
    const ctx = await requireGrcAdmin(request, reply);
    if (!ctx || (ctx as any).success === false) return;
    const q = z.object({ ativo: z.string().optional(), pagina: z.coerce.number().int().min(1).default(1), limite: z.coerce.number().int().min(1).max(100).default(30) }).parse(request.query || {});
    const where: any = { tenantId: ctx.tenantId };
    if (q.ativo) where.ativo = String(q.ativo).toLowerCase() === 'true';
    const skip = (q.pagina - 1) * q.limite;
    const [rows, total] = await Promise.all([
      prisma.grcControle.findMany({ where, orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }], skip, take: q.limite }),
      prisma.grcControle.count({ where }),
    ]);
    return ok(reply, rows, { meta: { pagina: q.pagina, limite: q.limite, total } });
  });

  server.post(
    '/controles',
    {
      schema: {
        body: z.object({
          codigo: z.string().min(2),
          nome: z.string().min(2),
          descricao: z.string().optional().nullable(),
          categoriaControle: z.string().optional().nullable(),
          tipoControle: z.enum(['PREVENTIVO', 'DETECTIVO', 'CORRETIVO']),
          automacaoControle: z.enum(['MANUAL', 'SEMI_AUTOMATIZADO', 'AUTOMATIZADO']),
          frequenciaExecucao: z.string().optional().nullable(),
          ownerUserId: z.number().int().optional().nullable(),
          executorTipo: z.string().optional().nullable(),
          evidenciaObrigatoria: z.boolean().default(false),
          ativo: z.boolean().default(true),
          criticidade: z.enum(['BAIXA', 'MEDIA', 'ALTA', 'CRITICA']).default('MEDIA'),
          objetivoControle: z.string().optional().nullable(),
          procedimentoExecucao: z.string().optional().nullable(),
        }),
      },
    },
    async (request, reply) => {
      const ctx = await requireGrcAdmin(request, reply);
      if (!ctx || (ctx as any).success === false) return;
      const body = request.body as any;
      const created = await prisma.grcControle.create({
        data: {
          tenantId: ctx.tenantId,
          codigo: String(body.codigo).toUpperCase(),
          nome: String(body.nome),
          descricao: body.descricao ?? null,
          categoriaControle: body.categoriaControle ?? null,
          tipoControle: String(body.tipoControle),
          automacaoControle: String(body.automacaoControle),
          frequenciaExecucao: body.frequenciaExecucao ?? null,
          ownerUserId: typeof body.ownerUserId === 'number' ? body.ownerUserId : ctx.userId,
          executorTipo: body.executorTipo ?? null,
          evidenciaObrigatoria: body.evidenciaObrigatoria === true,
          ativo: body.ativo !== false,
          criticidade: String(body.criticidade),
          objetivoControle: body.objetivoControle ?? null,
          procedimentoExecucao: body.procedimentoExecucao ?? null,
        } as any,
      });
      return ok(reply, { id: created.id }, { message: 'Controle criado' });
    }
  );

  server.post(
    '/controles/:id/testes',
    {
      schema: {
        params: z.object({ id: z.coerce.number().int() }),
        body: z.object({
          tipoTeste: z.enum(['DESENHO', 'OPERACAO', 'CONTINUO', 'AUTOMATIZADO']),
          periodoReferencia: z.string().optional().nullable(),
          amostraJson: z.any().optional().nullable(),
          resultadoTeste: z.enum(['EFETIVO', 'PARCIALMENTE_EFETIVO', 'INEFETIVO', 'NAO_APLICAVEL']),
          falhasIdentificadas: z.string().optional().nullable(),
          efetividadeScore: z.number().int().min(0).max(100).optional().nullable(),
          conclusao: z.string().optional().nullable(),
        }),
      },
    },
    async (request, reply) => {
      const ctx = await requireGrcAdmin(request, reply);
      if (!ctx || (ctx as any).success === false) return;
      const { id } = request.params as any;
      const body = request.body as any;
      const ctrl = await prisma.grcControle.findUnique({ where: { id: Number(id) } }).catch(() => null);
      if (!ctrl || ctrl.tenantId !== ctx.tenantId) return fail(reply, 404, 'Controle não encontrado');
      const created = await prisma.grcControleTeste.create({
        data: {
          tenantId: ctx.tenantId,
          controleId: ctrl.id,
          tipoTeste: String(body.tipoTeste),
          periodoReferencia: body.periodoReferencia ?? null,
          amostraJson: body.amostraJson ?? null,
          resultadoTeste: String(body.resultadoTeste),
          falhasIdentificadas: body.falhasIdentificadas ?? null,
          efetividadeScore: body.efetividadeScore ?? null,
          executadoPor: ctx.userId,
          conclusao: body.conclusao ?? null,
        } as any,
      });
      await emitObservabilityEvent({
        tenantId: ctx.tenantId,
        categoria: 'SECURITY',
        nomeEvento: 'grc.control.tested',
        severidade: body.resultadoTeste === 'INEFETIVO' ? 'ERROR' : body.resultadoTeste === 'PARCIALMENTE_EFETIVO' ? 'WARNING' : 'INFO',
        resultado: 'SUCESSO',
        origemTipo: 'INTERNAL',
        modulo: 'GRC',
        entidadeTipo: 'GRC_CONTROLE',
        entidadeId: ctrl.id,
        actorUserId: ctx.userId,
        payload: { tipoTeste: body.tipoTeste, resultadoTeste: body.resultadoTeste, efetividadeScore: body.efetividadeScore ?? null },
      });
      return ok(reply, { id: created.id }, { message: 'Teste registrado' });
    }
  );

  server.post(
    '/controles/:id/riscos',
    {
      schema: {
        params: z.object({ id: z.coerce.number().int() }),
        body: z.object({
          riscoId: z.number().int(),
          papelControle: z.enum(['MITIGA', 'DETECTA', 'RECUPERA']),
          pesoMitigacao: z.number().int().min(1).max(10).default(1),
        }),
      },
    },
    async (request, reply) => {
      const ctx = await requireGrcAdmin(request, reply);
      if (!ctx || (ctx as any).success === false) return;
      const { id } = request.params as any;
      const body = request.body as any;
      const ctrl = await prisma.grcControle.findUnique({ where: { id: Number(id) } }).catch(() => null);
      if (!ctrl || ctrl.tenantId !== ctx.tenantId) return fail(reply, 404, 'Controle não encontrado');
      const risco = await prisma.grcRisco.findUnique({ where: { id: Number(body.riscoId) } }).catch(() => null);
      if (!risco || risco.tenantId !== ctx.tenantId) return fail(reply, 404, 'Risco não encontrado');
      await prisma.grcRiscoControle.create({
        data: { tenantId: ctx.tenantId, riscoId: risco.id, controleId: ctrl.id, papelControle: String(body.papelControle), pesoMitigacao: Number(body.pesoMitigacao) } as any,
      });
      return ok(reply, { ok: true }, { message: 'Vínculo criado' });
    }
  );

  server.get('/auditorias', async (request, reply) => {
    const ctx = await requireGrcAdmin(request, reply);
    if (!ctx || (ctx as any).success === false) return;
    const q = z.object({ status: z.string().optional(), pagina: z.coerce.number().int().min(1).default(1), limite: z.coerce.number().int().min(1).max(100).default(30) }).parse(request.query || {});
    const where: any = { tenantId: ctx.tenantId };
    if (q.status) where.statusAuditoria = String(q.status).toUpperCase();
    const skip = (q.pagina - 1) * q.limite;
    const [rows, total] = await Promise.all([
      prisma.grcAuditoria.findMany({ where, orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }], skip, take: q.limite }),
      prisma.grcAuditoria.count({ where }),
    ]);
    return ok(reply, rows, { meta: { pagina: q.pagina, limite: q.limite, total } });
  });

  server.post(
    '/auditorias',
    {
      schema: {
        body: z.object({
          codigo: z.string().min(2),
          nome: z.string().min(2),
          tipoAuditoria: z.enum(['INTERNA', 'TEMATICA', 'FORENSE', 'COMPLIANCE', 'OPERACIONAL', 'TERCEIROS']).default('INTERNA'),
          statusAuditoria: z.string().default('PLANEJADA'),
          escopoDescricao: z.string().optional().nullable(),
          auditorLiderUserId: z.number().int().optional().nullable(),
          dataInicioPlanejada: z.string().optional().nullable(),
          dataFimPlanejada: z.string().optional().nullable(),
        }),
      },
    },
    async (request, reply) => {
      const ctx = await requireGrcAdmin(request, reply);
      if (!ctx || (ctx as any).success === false) return;
      const body = request.body as any;
      const created = await prisma.grcAuditoria.create({
        data: {
          tenantId: ctx.tenantId,
          codigo: String(body.codigo).toUpperCase(),
          nome: String(body.nome),
          tipoAuditoria: String(body.tipoAuditoria),
          statusAuditoria: String(body.statusAuditoria).toUpperCase(),
          escopoDescricao: body.escopoDescricao ?? null,
          ownerUserId: ctx.userId,
          auditorLiderUserId: body.auditorLiderUserId ?? null,
          dataInicioPlanejada: body.dataInicioPlanejada ? new Date(String(body.dataInicioPlanejada)) : null,
          dataFimPlanejada: body.dataFimPlanejada ? new Date(String(body.dataFimPlanejada)) : null,
        } as any,
      });
      return ok(reply, { id: created.id }, { message: 'Auditoria criada' });
    }
  );

  server.post('/auditorias/:id/encerrar', async (request, reply) => {
    const ctx = await requireGrcAdmin(request, reply);
    if (!ctx || (ctx as any).success === false) return;
    const { id } = z.object({ id: z.coerce.number().int() }).parse(request.params || {});
    const body = z.object({ opiniaoFinal: z.string().optional().nullable(), ratingFinal: z.string().optional().nullable() }).parse((request.body as any) || {});
    const aud = await prisma.grcAuditoria.findUnique({ where: { id } }).catch(() => null);
    if (!aud || aud.tenantId !== ctx.tenantId) return fail(reply, 404, 'Auditoria não encontrada');
    await prisma.grcAuditoria.update({
      where: { id: aud.id },
      data: { statusAuditoria: 'ENCERRADA', dataFimReal: new Date(), opiniaoFinal: body.opiniaoFinal ?? null, ratingFinal: body.ratingFinal ?? null } as any,
    });
    return ok(reply, { ok: true }, { message: 'Auditoria encerrada' });
  });

  server.get('/achados', async (request, reply) => {
    const ctx = await requireGrcAdmin(request, reply);
    if (!ctx || (ctx as any).success === false) return;
    const q = z.object({ status: z.string().optional(), gravidade: z.string().optional(), pagina: z.coerce.number().int().min(1).default(1), limite: z.coerce.number().int().min(1).max(100).default(30) }).parse(request.query || {});
    const where: any = { tenantId: ctx.tenantId };
    if (q.status) where.statusAchado = String(q.status).toUpperCase();
    if (q.gravidade) where.gravidade = String(q.gravidade).toUpperCase();
    const skip = (q.pagina - 1) * q.limite;
    const [rows, total] = await Promise.all([
      prisma.grcAchado.findMany({ where, orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }], skip, take: q.limite }),
      prisma.grcAchado.count({ where }),
    ]);
    return ok(reply, rows, { meta: { pagina: q.pagina, limite: q.limite, total } });
  });

  server.post(
    '/achados',
    {
      schema: {
        body: z.object({
          auditoriaId: z.number().int().optional().nullable(),
          riscoId: z.number().int().optional().nullable(),
          controleId: z.number().int().optional().nullable(),
          incidenteId: z.number().int().optional().nullable(),
          criseId: z.number().int().optional().nullable(),
          titulo: z.string().min(2),
          descricao: z.string().optional().nullable(),
          gravidade: z.enum(['OBSERVACAO', 'BAIXA', 'MEDIA', 'ALTA', 'CRITICA']).default('MEDIA'),
          statusAchado: z.enum(['ABERTO', 'EM_TRATAMENTO', 'EM_VALIDACAO', 'ENCERRADO', 'ACEITO']).default('ABERTO'),
          causaRaiz: z.string().optional().nullable(),
          impactoResumo: z.string().optional().nullable(),
          recomendacao: z.string().optional().nullable(),
          ownerUserId: z.number().int().optional().nullable(),
          prazoTratativaEm: z.string().optional().nullable(),
        }),
      },
    },
    async (request, reply) => {
      const ctx = await requireGrcAdmin(request, reply);
      if (!ctx || (ctx as any).success === false) return;
      const body = request.body as any;
      const created = await prisma.grcAchado.create({
        data: {
          tenantId: ctx.tenantId,
          auditoriaId: body.auditoriaId ?? null,
          riscoId: body.riscoId ?? null,
          controleId: body.controleId ?? null,
          incidenteId: body.incidenteId ?? null,
          criseId: body.criseId ?? null,
          titulo: String(body.titulo),
          descricao: body.descricao ?? null,
          gravidade: String(body.gravidade),
          statusAchado: String(body.statusAchado),
          causaRaiz: body.causaRaiz ?? null,
          impactoResumo: body.impactoResumo ?? null,
          recomendacao: body.recomendacao ?? null,
          ownerUserId: typeof body.ownerUserId === 'number' ? body.ownerUserId : ctx.userId,
          prazoTratativaEm: body.prazoTratativaEm ? new Date(String(body.prazoTratativaEm)) : null,
        } as any,
      });
      await emitObservabilityEvent({
        tenantId: ctx.tenantId,
        categoria: 'SECURITY',
        nomeEvento: 'grc.finding.created',
        severidade: body.gravidade === 'CRITICA' ? 'CRITICAL' : body.gravidade === 'ALTA' ? 'ERROR' : 'WARNING',
        resultado: 'SUCESSO',
        origemTipo: 'INTERNAL',
        modulo: 'GRC',
        entidadeTipo: 'GRC_ACHADO',
        entidadeId: created.id,
        actorUserId: ctx.userId,
        payload: { gravidade: body.gravidade, statusAchado: body.statusAchado },
      });
      return ok(reply, { id: created.id }, { message: 'Achado criado' });
    }
  );

  server.post('/achados/:id/encerrar', async (request, reply) => {
    const ctx = await requireGrcAdmin(request, reply);
    if (!ctx || (ctx as any).success === false) return;
    const { id } = z.object({ id: z.coerce.number().int() }).parse(request.params || {});
    const ach = await prisma.grcAchado.findUnique({ where: { id } }).catch(() => null);
    if (!ach || ach.tenantId !== ctx.tenantId) return fail(reply, 404, 'Achado não encontrado');
    await prisma.grcAchado.update({ where: { id: ach.id }, data: { statusAchado: 'ENCERRADO' } as any });
    return ok(reply, { ok: true }, { message: 'Achado encerrado' });
  });

  server.get('/planos-acao', async (request, reply) => {
    const ctx = await requireGrcAdmin(request, reply);
    if (!ctx || (ctx as any).success === false) return;
    const q = z.object({ status: z.string().optional(), pagina: z.coerce.number().int().min(1).default(1), limite: z.coerce.number().int().min(1).max(100).default(30) }).parse(request.query || {});
    const where: any = { tenantId: ctx.tenantId };
    if (q.status) where.statusPlano = String(q.status).toUpperCase();
    const skip = (q.pagina - 1) * q.limite;
    const [rows, total] = await Promise.all([
      prisma.grcPlanoAcao.findMany({ where, orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }], skip, take: q.limite }),
      prisma.grcPlanoAcao.count({ where }),
    ]);
    return ok(reply, rows, { meta: { pagina: q.pagina, limite: q.limite, total } });
  });

  server.post(
    '/planos-acao',
    {
      schema: {
        body: z.object({
          origemTipo: z.enum(['RISCO', 'ACHADO', 'INCIDENTE', 'CRISE', 'CONTROLE', 'AUDITORIA']),
          origemId: z.number().int(),
          titulo: z.string().min(2),
          descricao: z.string().optional().nullable(),
          criticidade: z.enum(['BAIXA', 'MEDIA', 'ALTA', 'CRITICA']).default('MEDIA'),
          ownerUserId: z.number().int().optional().nullable(),
          aprovadorUserId: z.number().int().optional().nullable(),
          dataLimite: z.string().optional().nullable(),
          resultadoEsperado: z.string().optional().nullable(),
          criterioAceite: z.string().optional().nullable(),
        }),
      },
    },
    async (request, reply) => {
      const ctx = await requireGrcAdmin(request, reply);
      if (!ctx || (ctx as any).success === false) return;
      const body = request.body as any;
      const created = await prisma.grcPlanoAcao.create({
        data: {
          tenantId: ctx.tenantId,
          origemTipo: String(body.origemTipo),
          origemId: Number(body.origemId),
          titulo: String(body.titulo),
          descricao: body.descricao ?? null,
          statusPlano: 'ABERTO',
          criticidade: String(body.criticidade),
          ownerUserId: typeof body.ownerUserId === 'number' ? body.ownerUserId : ctx.userId,
          aprovadorUserId: typeof body.aprovadorUserId === 'number' ? body.aprovadorUserId : null,
          dataLimite: body.dataLimite ? new Date(String(body.dataLimite)) : null,
          resultadoEsperado: body.resultadoEsperado ?? null,
          criterioAceite: body.criterioAceite ?? null,
        } as any,
      });
      return ok(reply, { id: created.id }, { message: 'Plano de ação criado' });
    }
  );

  server.post('/planos-acao/:id/aprovar', async (request, reply) => {
    const ctx = await requireGrcAdmin(request, reply);
    if (!ctx || (ctx as any).success === false) return;
    const { id } = z.object({ id: z.coerce.number().int() }).parse(request.params || {});
    const plano = await prisma.grcPlanoAcao.findUnique({ where: { id } }).catch(() => null);
    if (!plano || plano.tenantId !== ctx.tenantId) return fail(reply, 404, 'Plano não encontrado');
    await prisma.grcPlanoAcao.update({ where: { id: plano.id }, data: { statusPlano: 'EM_ANDAMENTO', aprovadorUserId: ctx.userId } as any });
    return ok(reply, { ok: true }, { message: 'Plano aprovado' });
  });

  server.post('/planos-acao/:id/concluir', async (request, reply) => {
    const ctx = await requireGrcAdmin(request, reply);
    if (!ctx || (ctx as any).success === false) return;
    const { id } = z.object({ id: z.coerce.number().int() }).parse(request.params || {});
    const plano = await prisma.grcPlanoAcao.findUnique({ where: { id } }).catch(() => null);
    if (!plano || plano.tenantId !== ctx.tenantId) return fail(reply, 404, 'Plano não encontrado');
    await prisma.grcPlanoAcao.update({ where: { id: plano.id }, data: { statusPlano: 'CONCLUIDO', concluidoEm: new Date() } as any });
    return ok(reply, { ok: true }, { message: 'Plano concluído' });
  });

  server.get('/evidencias', async (request, reply) => {
    const ctx = await requireGrcAdmin(request, reply);
    if (!ctx || (ctx as any).success === false) return;
    const q = z
      .object({
        referenciaTipo: z.string().optional(),
        referenciaId: z.coerce.number().int().optional(),
        pagina: z.coerce.number().int().min(1).default(1),
        limite: z.coerce.number().int().min(1).max(100).default(30),
      })
      .parse(request.query || {});
    const where: any = { tenantId: ctx.tenantId };
    if (q.referenciaTipo) where.referenciaTipo = String(q.referenciaTipo).toUpperCase();
    if (q.referenciaId) where.referenciaId = Number(q.referenciaId);
    const skip = (q.pagina - 1) * q.limite;
    const [rows, total] = await Promise.all([
      prisma.grcEvidencia.findMany({ where, orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }], skip, take: q.limite }),
      prisma.grcEvidencia.count({ where }),
    ]);
    return ok(reply, rows, { meta: { pagina: q.pagina, limite: q.limite, total } });
  });

  server.post(
    '/evidencias',
    {
      schema: {
        body: z.object({
          referenciaTipo: z.string().min(2),
          referenciaId: z.number().int(),
          tipoEvidencia: z.string().min(2),
          titulo: z.string().optional().nullable(),
          descricao: z.string().optional().nullable(),
          arquivoPath: z.string().optional().nullable(),
          hashSha256: z.string().optional().nullable(),
          metadataJson: z.any().optional().nullable(),
        }),
      },
    },
    async (request, reply) => {
      const ctx = await requireGrcAdmin(request, reply);
      if (!ctx || (ctx as any).success === false) return;
      const body = request.body as any;
      const created = await prisma.grcEvidencia.create({
        data: {
          tenantId: ctx.tenantId,
          referenciaTipo: String(body.referenciaTipo).toUpperCase(),
          referenciaId: Number(body.referenciaId),
          tipoEvidencia: String(body.tipoEvidencia).toUpperCase(),
          titulo: body.titulo ?? null,
          descricao: body.descricao ?? null,
          arquivoPath: body.arquivoPath ?? null,
          hashSha256: body.hashSha256 ?? null,
          coletadoPor: ctx.userId,
          metadataJson: body.metadataJson ?? null,
        } as any,
      });
      return ok(reply, { id: created.id }, { message: 'Evidência anexada' });
    }
  );
}

