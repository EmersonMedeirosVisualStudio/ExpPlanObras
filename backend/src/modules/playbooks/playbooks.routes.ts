import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import prisma from '../../plugins/prisma.js';
import { authenticate } from '../../utils/authenticate.js';
import { simularPlaybook, executarPlaybook, aprovarExecucao, cancelarExecucao } from './playbooks.service.js';

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

async function requireAdmin(request: FastifyRequest, reply: FastifyReply) {
  const ctx = getAuthContext(request);
  if (!ctx) return fail(reply, 401, 'Não autenticado');
  if (ctx.isSystemAdmin) return fail(reply, 403, 'Tenant não selecionado');
  const tenantUser = await prisma.tenantUser.findUnique({
    where: { tenantId_userId: { tenantId: ctx.tenantId, userId: ctx.userId } },
    select: { role: true },
  });
  if (!tenantUser) return fail(reply, 403, 'Tenant não selecionado');
  if (tenantUser.role === 'ADMIN') return ctx;
  return fail(reply, 403, 'Acesso negado');
}

export default async function playbooksRoutes(server: FastifyInstance) {
  server.addHook('onRequest', authenticate);

  server.get('/playbooks', async (request, reply) => {
    const ctx = await requireAdmin(request, reply);
    if (!ctx || (ctx as any).success === false) return;
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
      prisma.observabilidadePlaybook.findMany({ where, orderBy: [{ ordemPrioridade: 'asc' }, { id: 'desc' }], skip, take: q.limite }),
      prisma.observabilidadePlaybook.count({ where }),
    ]);
    return ok(reply, rows, { meta: { pagina: q.pagina, limite: q.limite, total } });
  });

  server.post(
    '/playbooks',
    {
      schema: {
        body: z.object({
          codigo: z.string().min(2),
          nome: z.string().min(2),
          descricao: z.string().optional().nullable(),
          categoria: z.string().optional().nullable(),
          modoExecucao: z.enum(['MANUAL', 'SEMI_AUTOMATICO', 'AUTOMATICO']).default('MANUAL'),
          gatilhoTipo: z.enum(['ALERTA_ABERTO', 'ALERTA_CRITICO', 'INCIDENTE_ABERTO', 'EVENTO_CORRELACIONADO', 'AGENDADO', 'MANUAL']).default('MANUAL'),
          filtroEventoJson: z.any().optional().nullable(),
          filtroAlertaJson: z.any().optional().nullable(),
          filtroIncidenteJson: z.any().optional().nullable(),
          riscoPadrao: z.enum(['BAIXO', 'MEDIO', 'ALTO', 'CRITICO']).default('BAIXO'),
          politicaAprovacao: z.enum(['NAO_EXIGE', 'EXIGE_ANTES', 'EXIGE_SE_RISCO_ALTO', 'QUATRO_OLHOS']).default('EXIGE_SE_RISCO_ALTO'),
          ativo: z.boolean().default(true),
          ordemPrioridade: z.number().int().default(1000),
          passos: z
            .array(
              z.object({
                ordemExecucao: z.number().int().min(1),
                tipoAcao: z.string().min(2),
                nomePasso: z.string().min(2),
                descricao: z.string().optional().nullable(),
                configuracaoJson: z.any().optional().nullable(),
                timeoutSegundos: z.number().int().optional().nullable(),
                continuaEmErro: z.boolean().optional().default(false),
                reversivel: z.boolean().optional().default(false),
                acaoCompensacaoJson: z.any().optional().nullable(),
                riscoAcao: z.enum(['BAIXO', 'MEDIO', 'ALTO', 'CRITICO']).default('BAIXO'),
              })
            )
            .default([]),
        }),
      },
    },
    async (request, reply) => {
      const ctx = await requireAdmin(request, reply);
      if (!ctx || (ctx as any).success === false) return;
      const body = request.body as any;
      const created = await prisma.$transaction(async (tx) => {
        const pb = await tx.observabilidadePlaybook.create({
          data: {
            tenantId: ctx.tenantId,
            codigo: String(body.codigo),
            nome: String(body.nome),
            descricao: body.descricao ?? null,
            categoria: body.categoria ?? null,
            modoExecucao: String(body.modoExecucao),
            gatilhoTipo: String(body.gatilhoTipo),
            filtroEventoJson: body.filtroEventoJson ?? null,
            filtroAlertaJson: body.filtroAlertaJson ?? null,
            filtroIncidenteJson: body.filtroIncidenteJson ?? null,
            riscoPadrao: String(body.riscoPadrao),
            politicaAprovacao: String(body.politicaAprovacao),
            ativo: body.ativo !== false,
            ordemPrioridade: Number(body.ordemPrioridade || 1000),
          } as any,
        });
        if (Array.isArray(body.passos) && body.passos.length) {
          await tx.observabilidadePlaybookPasso.createMany({
            data: body.passos.map((p: any) => ({
              tenantId: ctx.tenantId,
              playbookId: pb.id,
              ordemExecucao: Number(p.ordemExecucao),
              tipoAcao: String(p.tipoAcao),
              nomePasso: String(p.nomePasso),
              descricao: p.descricao ?? null,
              configuracaoJson: p.configuracaoJson ?? null,
              timeoutSegundos: p.timeoutSegundos ?? null,
              continuaEmErro: Boolean(p.continuaEmErro),
              reversivel: Boolean(p.reversivel),
              acaoCompensacaoJson: p.acaoCompensacaoJson ?? null,
              riscoAcao: String(p.riscoAcao || 'BAIXO'),
            })),
          });
        }
        return pb;
      });
      return ok(reply, { id: created.id }, { message: 'Playbook criado' });
    }
  );

  server.get('/playbooks/:id', async (request, reply) => {
    const ctx = await requireAdmin(request, reply);
    if (!ctx || (ctx as any).success === false) return;
    const { id } = z.object({ id: z.coerce.number().int() }).parse(request.params || {});
    const pb = await prisma.observabilidadePlaybook.findUnique({ where: { id }, include: { passos: { orderBy: [{ ordemExecucao: 'asc' }] } } }).catch(() => null);
    if (!pb || pb.tenantId !== ctx.tenantId) return fail(reply, 404, 'Playbook não encontrado');
    return ok(reply, pb);
  });

  server.put(
    '/playbooks/:id',
    {
      schema: {
        params: z.object({ id: z.coerce.number().int() }),
        body: z.object({
          nome: z.string().optional(),
          descricao: z.string().optional().nullable(),
          categoria: z.string().optional().nullable(),
          modoExecucao: z.enum(['MANUAL', 'SEMI_AUTOMATICO', 'AUTOMATICO']).optional(),
          gatilhoTipo: z.enum(['ALERTA_ABERTO', 'ALERTA_CRITICO', 'INCIDENTE_ABERTO', 'EVENTO_CORRELACIONADO', 'AGENDADO', 'MANUAL']).optional(),
          filtroEventoJson: z.any().optional().nullable(),
          filtroAlertaJson: z.any().optional().nullable(),
          filtroIncidenteJson: z.any().optional().nullable(),
          riscoPadrao: z.enum(['BAIXO', 'MEDIO', 'ALTO', 'CRITICO']).optional(),
          politicaAprovacao: z.enum(['NAO_EXIGE', 'EXIGE_ANTES', 'EXIGE_SE_RISCO_ALTO', 'QUATRO_OLHOS']).optional(),
          ativo: z.boolean().optional(),
          ordemPrioridade: z.number().int().optional(),
          passos: z
            .array(
              z.object({
                ordemExecucao: z.number().int().min(1),
                tipoAcao: z.string().min(2),
                nomePasso: z.string().min(2),
                descricao: z.string().optional().nullable(),
                configuracaoJson: z.any().optional().nullable(),
                timeoutSegundos: z.number().int().optional().nullable(),
                continuaEmErro: z.boolean().optional().default(false),
                reversivel: z.boolean().optional().default(false),
                acaoCompensacaoJson: z.any().optional().nullable(),
                riscoAcao: z.enum(['BAIXO', 'MEDIO', 'ALTO', 'CRITICO']).default('BAIXO'),
              })
            )
            .optional(),
        }),
      },
    },
    async (request, reply) => {
      const ctx = await requireAdmin(request, reply);
      if (!ctx || (ctx as any).success === false) return;
      const { id } = request.params as any;
      const body = request.body as any;
      const pb = await prisma.observabilidadePlaybook.findUnique({ where: { id: Number(id) } }).catch(() => null);
      if (!pb || pb.tenantId !== ctx.tenantId) return fail(reply, 404, 'Playbook não encontrado');
      await prisma.$transaction(async (tx) => {
        await tx.observabilidadePlaybook.update({
          where: { id: pb.id },
          data: {
            nome: body.nome != null ? String(body.nome) : undefined,
            descricao: body.descricao !== undefined ? body.descricao : undefined,
            categoria: body.categoria !== undefined ? body.categoria : undefined,
            modoExecucao: body.modoExecucao != null ? String(body.modoExecucao) : undefined,
            gatilhoTipo: body.gatilhoTipo != null ? String(body.gatilhoTipo) : undefined,
            filtroEventoJson: body.filtroEventoJson !== undefined ? body.filtroEventoJson : undefined,
            filtroAlertaJson: body.filtroAlertaJson !== undefined ? body.filtroAlertaJson : undefined,
            filtroIncidenteJson: body.filtroIncidenteJson !== undefined ? body.filtroIncidenteJson : undefined,
            riscoPadrao: body.riscoPadrao != null ? String(body.riscoPadrao) : undefined,
            politicaAprovacao: body.politicaAprovacao != null ? String(body.politicaAprovacao) : undefined,
            ativo: typeof body.ativo === 'boolean' ? body.ativo : undefined,
            ordemPrioridade: typeof body.ordemPrioridade === 'number' ? body.ordemPrioridade : undefined,
          } as any,
        });
        if (Array.isArray(body.passos)) {
          await tx.observabilidadePlaybookPasso.deleteMany({ where: { tenantId: ctx.tenantId, playbookId: pb.id } });
          if (body.passos.length) {
            await tx.observabilidadePlaybookPasso.createMany({
              data: body.passos.map((p: any) => ({
                tenantId: ctx.tenantId,
                playbookId: pb.id,
                ordemExecucao: Number(p.ordemExecucao),
                tipoAcao: String(p.tipoAcao),
                nomePasso: String(p.nomePasso),
                descricao: p.descricao ?? null,
                configuracaoJson: p.configuracaoJson ?? null,
                timeoutSegundos: p.timeoutSegundos ?? null,
                continuaEmErro: Boolean(p.continuaEmErro),
                reversivel: Boolean(p.reversivel),
                acaoCompensacaoJson: p.acaoCompensacaoJson ?? null,
                riscoAcao: String(p.riscoAcao || 'BAIXO'),
              })),
            });
          }
        }
      });
      return ok(reply, { ok: true }, { message: 'Playbook atualizado' });
    }
  );

  server.post('/playbooks/:id/simular', async (request, reply) => {
    const ctx = await requireAdmin(request, reply);
    if (!ctx || (ctx as any).success === false) return;
    const { id } = z.object({ id: z.coerce.number().int() }).parse(request.params || {});
    const res = await simularPlaybook({ tenantId: ctx.tenantId, playbookId: id });
    if (!res.ok) return fail(reply, 404, 'Playbook não encontrado');
    return ok(reply, res);
  });

  server.post(
    '/playbooks/:id/executar',
    {
      schema: {
        params: z.object({ id: z.coerce.number().int() }),
        body: z
          .object({
            alertaId: z.number().int().optional().nullable(),
            incidenteId: z.number().int().optional().nullable(),
            eventoOrigemId: z.number().int().optional().nullable(),
            modoExecucao: z.enum(['MANUAL', 'SEMI_AUTOMATICO', 'AUTOMATICO']).optional().nullable(),
          })
          .optional(),
      },
    },
    async (request, reply) => {
      const ctx = await requireAdmin(request, reply);
      if (!ctx || (ctx as any).success === false) return;
      const { id } = request.params as any;
      const body = (request.body as any) || {};
      const res = await executarPlaybook({
        tenantId: ctx.tenantId,
        executorUserId: ctx.userId,
        playbookId: Number(id),
        alertaId: body.alertaId ?? null,
        incidenteId: body.incidenteId ?? null,
        eventoOrigemId: body.eventoOrigemId ?? null,
        modoExecucao: body.modoExecucao ?? undefined,
      });
      if (!res.ok) return fail(reply, 400, (res as any).reason || 'Falha');
      return ok(reply, res, { message: 'Execução registrada' });
    }
  );

  server.get('/playbooks/execucoes', async (request, reply) => {
    const ctx = await requireAdmin(request, reply);
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
      prisma.observabilidadePlaybookExecucao.findMany({ where, orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }], skip, take: q.limite }),
      prisma.observabilidadePlaybookExecucao.count({ where }),
    ]);
    return ok(reply, rows, { meta: { pagina: q.pagina, limite: q.limite, total } });
  });

  server.post(
    '/playbooks/execucoes/:id/aprovar',
    { schema: { params: z.object({ id: z.coerce.number().int() }) } },
    async (request, reply) => {
      const ctx = await requireAdmin(request, reply);
      if (!ctx || (ctx as any).success === false) return;
      const { id } = request.params as any;
      const res = await aprovarExecucao({ tenantId: ctx.tenantId, aprovadorUserId: ctx.userId, execucaoId: Number(id) });
      if (!res.ok) return fail(reply, 400, (res as any).reason || 'Falha ao aprovar');
      return ok(reply, res, { message: 'Execução aprovada' });
    }
  );

  server.post(
    '/playbooks/execucoes/:id/cancelar',
    { schema: { params: z.object({ id: z.coerce.number().int() }), body: z.object({ motivo: z.string().optional().nullable() }) } },
    async (request, reply) => {
      const ctx = await requireAdmin(request, reply);
      if (!ctx || (ctx as any).success === false) return;
      const { id } = request.params as any;
      const body = request.body as any;
      const res = await cancelarExecucao({ tenantId: ctx.tenantId, userId: ctx.userId, execucaoId: Number(id), motivo: body?.motivo ?? null });
      if (!res.ok) return fail(reply, 400, (res as any).reason || 'Falha ao cancelar');
      return ok(reply, res, { message: 'Execução cancelada' });
    }
  );

  server.get('/incidentes/:id/timeline', async (request, reply) => {
    const ctx = await requireAdmin(request, reply);
    if (!ctx || (ctx as any).success === false) return;
    const { id } = z.object({ id: z.coerce.number().int() }).parse(request.params || {});
    const inc = await prisma.observabilidadeIncidente.findUnique({ where: { id } }).catch(() => null);
    if (!inc || inc.tenantId !== ctx.tenantId) return fail(reply, 404, 'Incidente não encontrado');
    const rows = await prisma.observabilidadeIncidenteTimeline.findMany({ where: { tenantId: ctx.tenantId, incidenteId: id }, orderBy: [{ criadoEm: 'asc' }] });
    return ok(reply, rows);
  });

  server.post(
    '/incidentes/:id/timeline',
    {
      schema: {
        params: z.object({ id: z.coerce.number().int() }),
        body: z.object({
          tipoEventoTimeline: z.string().min(2),
          titulo: z.string().min(2),
          descricao: z.string().optional().nullable(),
          metadataJson: z.any().optional().nullable(),
        }),
      },
    },
    async (request, reply) => {
      const ctx = await requireAdmin(request, reply);
      if (!ctx || (ctx as any).success === false) return;
      const { id } = request.params as any;
      const inc = await prisma.observabilidadeIncidente.findUnique({ where: { id: Number(id) } }).catch(() => null);
      if (!inc || inc.tenantId !== ctx.tenantId) return fail(reply, 404, 'Incidente não encontrado');
      const body = request.body as any;
      const created = await prisma.observabilidadeIncidenteTimeline.create({
        data: {
          tenantId: ctx.tenantId,
          incidenteId: Number(id),
          tipoEventoTimeline: String(body.tipoEventoTimeline),
          titulo: String(body.titulo),
          descricao: body.descricao ?? null,
          autorUserId: ctx.userId,
          metadataJson: body.metadataJson ?? null,
        },
      });
      return ok(reply, { id: created.id }, { message: 'Timeline registrada' });
    }
  );

  server.get('/compliance/casos', async (request, reply) => {
    const ctx = await requireAdmin(request, reply);
    if (!ctx || (ctx as any).success === false) return;
    const q = z
      .object({
        status: z.string().optional(),
        pagina: z.coerce.number().int().min(1).default(1),
        limite: z.coerce.number().int().min(1).max(100).default(30),
      })
      .parse(request.query || {});
    const where: any = { tenantId: ctx.tenantId };
    if (q.status) where.statusCaso = String(q.status).toUpperCase();
    const skip = (q.pagina - 1) * q.limite;
    const [rows, total] = await Promise.all([
      prisma.observabilidadeCasoCompliance.findMany({ where, orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }], skip, take: q.limite }),
      prisma.observabilidadeCasoCompliance.count({ where }),
    ]);
    return ok(reply, rows, { meta: { pagina: q.pagina, limite: q.limite, total } });
  });

  server.post(
    '/compliance/casos',
    {
      schema: {
        body: z.object({
          incidenteId: z.number().int().optional().nullable(),
          tipoCaso: z.enum(['LGPD', 'SEGURANCA', 'TERCEIRO', 'AUDITORIA', 'DOCUMENTAL']),
          criticidade: z.enum(['BAIXA', 'MEDIA', 'ALTA', 'CRITICA']).default('MEDIA'),
          ownerUserId: z.number().int().optional().nullable(),
          prazoRespostaEm: z.string().optional().nullable(),
          prazoConclusaoEm: z.string().optional().nullable(),
        }),
      },
    },
    async (request, reply) => {
      const ctx = await requireAdmin(request, reply);
      if (!ctx || (ctx as any).success === false) return;
      const body = request.body as any;
      const created = await prisma.observabilidadeCasoCompliance.create({
        data: {
          tenantId: ctx.tenantId,
          incidenteId: body.incidenteId ?? null,
          tipoCaso: String(body.tipoCaso),
          statusCaso: 'ABERTO',
          criticidade: String(body.criticidade),
          ownerUserId: body.ownerUserId ?? null,
          prazoRespostaEm: body.prazoRespostaEm ? new Date(String(body.prazoRespostaEm)) : null,
          prazoConclusaoEm: body.prazoConclusaoEm ? new Date(String(body.prazoConclusaoEm)) : null,
        } as any,
      });
      return ok(reply, { id: created.id }, { message: 'Caso criado' });
    }
  );

  server.get('/compliance/casos/:id', async (request, reply) => {
    const ctx = await requireAdmin(request, reply);
    if (!ctx || (ctx as any).success === false) return;
    const { id } = z.object({ id: z.coerce.number().int() }).parse(request.params || {});
    const row = await prisma.observabilidadeCasoCompliance.findUnique({ where: { id }, include: { evidencias: true } }).catch(() => null);
    if (!row || row.tenantId !== ctx.tenantId) return fail(reply, 404, 'Caso não encontrado');
    return ok(reply, row);
  });

  server.post(
    '/compliance/casos/:id/evidencias',
    {
      schema: {
        params: z.object({ id: z.coerce.number().int() }),
        body: z.object({
          tipoEvidencia: z.string().min(2),
          referenciaTipo: z.string().optional().nullable(),
          referenciaId: z.number().int().optional().nullable(),
          descricao: z.string().optional().nullable(),
          arquivoPath: z.string().optional().nullable(),
          hashSha256: z.string().optional().nullable(),
          metadataJson: z.any().optional().nullable(),
        }),
      },
    },
    async (request, reply) => {
      const ctx = await requireAdmin(request, reply);
      if (!ctx || (ctx as any).success === false) return;
      const { id } = request.params as any;
      const caso = await prisma.observabilidadeCasoCompliance.findUnique({ where: { id: Number(id) } }).catch(() => null);
      if (!caso || caso.tenantId !== ctx.tenantId) return fail(reply, 404, 'Caso não encontrado');
      const body = request.body as any;
      const created = await prisma.observabilidadeCasoComplianceEvidencia.create({
        data: {
          tenantId: ctx.tenantId,
          casoId: caso.id,
          tipoEvidencia: String(body.tipoEvidencia),
          referenciaTipo: body.referenciaTipo ?? null,
          referenciaId: body.referenciaId ?? null,
          descricao: body.descricao ?? null,
          arquivoPath: body.arquivoPath ?? null,
          hashSha256: body.hashSha256 ?? null,
          metadataJson: body.metadataJson ?? null,
        } as any,
      });
      return ok(reply, { id: created.id }, { message: 'Evidência adicionada' });
    }
  );

  server.post(
    '/compliance/casos/:id/encerrar',
    { schema: { params: z.object({ id: z.coerce.number().int() }), body: z.object({ parecerFinal: z.string().min(3) }) } },
    async (request, reply) => {
      const ctx = await requireAdmin(request, reply);
      if (!ctx || (ctx as any).success === false) return;
      const { id } = request.params as any;
      const body = request.body as any;
      const caso = await prisma.observabilidadeCasoCompliance.findUnique({ where: { id: Number(id) } }).catch(() => null);
      if (!caso || caso.tenantId !== ctx.tenantId) return fail(reply, 404, 'Caso não encontrado');
      await prisma.observabilidadeCasoCompliance.update({ where: { id: caso.id }, data: { statusCaso: 'CONCLUIDO', parecerFinal: String(body.parecerFinal) } as any });
      return ok(reply, { ok: true }, { message: 'Caso encerrado' });
    }
  );
}

