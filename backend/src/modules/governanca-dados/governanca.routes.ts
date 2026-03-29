import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import prisma from '../../plugins/prisma.js';
import { authenticate } from '../../utils/authenticate.js';
import { calcularScoreQualidadePorAtivo } from './quality.js';
import { sincronizarCatalogoBasico } from './scanner.js';
import { executarScanPiiAmostral } from './pii-scanner.js';
import { aceitarSugestaoClassificacao, rejeitarSugestaoClassificacao } from './classificacao.js';
import { auditGovernanca } from './audit.js';

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

async function requireGovernancaAdmin(request: FastifyRequest, reply: FastifyReply) {
  const ctx = getAuthContext(request);
  if (!ctx) return fail(reply, 401, 'Não autenticado');
  if (ctx.isSystemAdmin) {
    if (ctx.tenantId == null) return fail(reply, 403, 'Tenant não selecionado');
    return { ...ctx, tenantId: ctx.tenantId };
  }
  const tenantUser = await prisma.tenantUser.findUnique({
    where: { tenantId_userId: { tenantId: ctx.tenantId, userId: ctx.userId } },
    select: { role: true },
  });
  if (!tenantUser) return fail(reply, 403, 'Tenant não selecionado');
  if (tenantUser.role === 'ADMIN') return ctx;
  return fail(reply, 403, 'Acesso negado');
}

export default async function governancaDadosRoutes(server: FastifyInstance) {
  server.addHook('onRequest', authenticate);

  server.post('/sincronizar', async (request, reply) => {
    const ctx = await requireGovernancaAdmin(request, reply);
    if (!ctx || (ctx as any).success === false) return;
    const result = await sincronizarCatalogoBasico({ tenantId: ctx.tenantId });
    return ok(reply, result, { message: 'Sincronização concluída' });
  });

  server.post(
    '/pii-scans',
    {
      schema: {
        body: z.object({
          ativoId: z.number().int(),
          sampleSize: z.number().int().min(1).max(50).optional().nullable(),
        }),
      },
    },
    async (request, reply) => {
      const ctx = await requireGovernancaAdmin(request, reply);
      if (!ctx || (ctx as any).success === false) return;
      if (ctx.isSystemAdmin) return fail(reply, 403, 'Tenant não selecionado');
      const body = request.body as any;

      const res = await executarScanPiiAmostral({ tenantId: ctx.tenantId, userId: ctx.userId, ativoId: body.ativoId, sampleSize: body.sampleSize ?? undefined });
      await auditGovernanca({
        tenantId: ctx.tenantId,
        tipoEvento: 'PII_SCAN_EXECUTADO',
        recursoTipo: 'ATIVO',
        recursoId: body.ativoId,
        userId: ctx.userId,
        detalhesJson: res,
        ip: (request.ip as any) || null,
        userAgent: String(request.headers['user-agent'] || '') || null,
      });
      if (!res.ok) return fail(reply, 400, res.reason || 'Falha no scan');
      return ok(reply, res, { message: 'Scan concluído' });
    }
  );

  server.get('/pii-scans', async (request, reply) => {
    const ctx = await requireGovernancaAdmin(request, reply);
    if (!ctx || (ctx as any).success === false) return;
    if (ctx.isSystemAdmin) return fail(reply, 403, 'Tenant não selecionado');
    const q = z
      .object({
        status: z.string().optional(),
        pagina: z.coerce.number().int().min(1).default(1),
        limite: z.coerce.number().int().min(1).max(100).default(30),
      })
      .parse(request.query || {});
    const where: any = { tenantId: ctx.tenantId };
    if (q.status) where.statusScan = String(q.status).toUpperCase();
    const skip = (q.pagina - 1) * q.limite;
    const [rows, total] = await Promise.all([
      prisma.governancaPiiScan.findMany({ where, orderBy: [{ iniciadoEm: 'desc' }, { id: 'desc' }], skip, take: q.limite }),
      prisma.governancaPiiScan.count({ where }),
    ]);
    return ok(reply, rows, { meta: { pagina: q.pagina, limite: q.limite, total } });
  });

  server.get('/pii-scans/:id/resultados', async (request, reply) => {
    const ctx = await requireGovernancaAdmin(request, reply);
    if (!ctx || (ctx as any).success === false) return;
    if (ctx.isSystemAdmin) return fail(reply, 403, 'Tenant não selecionado');
    const { id } = z.object({ id: z.coerce.number().int() }).parse(request.params || {});
    const scan = await prisma.governancaPiiScan.findUnique({ where: { id } }).catch(() => null);
    if (!scan || scan.tenantId !== ctx.tenantId) return fail(reply, 404, 'Scan não encontrado');
    const rows = await prisma.governancaPiiScanResultado.findMany({
      where: { tenantId: ctx.tenantId, scanId: id },
      orderBy: [{ id: 'asc' }],
      include: { campo: { select: { id: true, caminhoCampo: true } } },
    });
    return ok(reply, rows);
  });

  server.get('/classificacao/sugestoes', async (request, reply) => {
    const ctx = await requireGovernancaAdmin(request, reply);
    if (!ctx || (ctx as any).success === false) return;
    if (ctx.isSystemAdmin) return fail(reply, 403, 'Tenant não selecionado');
    const q = z
      .object({
        status: z.string().optional(),
        pagina: z.coerce.number().int().min(1).default(1),
        limite: z.coerce.number().int().min(1).max(100).default(30),
      })
      .parse(request.query || {});
    const where: any = { tenantId: ctx.tenantId };
    if (q.status) where.statusSugestao = String(q.status).toUpperCase();
    const skip = (q.pagina - 1) * q.limite;
    const [rows, total] = await Promise.all([
      prisma.governancaClassificacaoSugestao.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip,
        take: q.limite,
        include: { ativo: { select: { id: true, codigoAtivo: true, nomeAtivo: true } }, campo: { select: { id: true, caminhoCampo: true } } },
      }),
      prisma.governancaClassificacaoSugestao.count({ where }),
    ]);
    return ok(reply, rows, { meta: { pagina: q.pagina, limite: q.limite, total } });
  });

  server.post('/classificacao/sugestoes/:id/aceitar', async (request, reply) => {
    const ctx = await requireGovernancaAdmin(request, reply);
    if (!ctx || (ctx as any).success === false) return;
    if (ctx.isSystemAdmin) return fail(reply, 403, 'Tenant não selecionado');
    const { id } = z.object({ id: z.coerce.number().int() }).parse(request.params || {});
    const res = await aceitarSugestaoClassificacao({ tenantId: ctx.tenantId, userId: ctx.userId, sugestaoId: id });
    await auditGovernanca({
      tenantId: ctx.tenantId,
      tipoEvento: 'CLASSIFICACAO_SUGESTAO_ACEITA',
      recursoTipo: 'SUGESTAO',
      recursoId: id,
      userId: ctx.userId,
      detalhesJson: res,
      ip: (request.ip as any) || null,
      userAgent: String(request.headers['user-agent'] || '') || null,
    });
    if (!res.ok) return fail(reply, 400, res.reason || 'Falha');
    return ok(reply, { ok: true }, { message: 'Sugestão aceita' });
  });

  server.post(
    '/classificacao/sugestoes/:id/rejeitar',
    {
      schema: { params: z.object({ id: z.coerce.number().int() }), body: z.object({ motivo: z.string().optional().nullable() }) },
    },
    async (request, reply) => {
      const ctx = await requireGovernancaAdmin(request, reply);
      if (!ctx || (ctx as any).success === false) return;
      if (ctx.isSystemAdmin) return fail(reply, 403, 'Tenant não selecionado');
      const { id } = request.params as any;
      const body = request.body as any;
      const res = await rejeitarSugestaoClassificacao({ tenantId: ctx.tenantId, userId: ctx.userId, sugestaoId: Number(id), motivo: body.motivo ?? null });
      await auditGovernanca({
        tenantId: ctx.tenantId,
        tipoEvento: 'CLASSIFICACAO_SUGESTAO_REJEITADA',
        recursoTipo: 'SUGESTAO',
        recursoId: Number(id),
        userId: ctx.userId,
        detalhesJson: { ...res, motivo: body.motivo ?? null },
        ip: (request.ip as any) || null,
        userAgent: String(request.headers['user-agent'] || '') || null,
      });
      if (!res.ok) return fail(reply, 400, res.reason || 'Falha');
      return ok(reply, { ok: true }, { message: 'Sugestão rejeitada' });
    }
  );

  server.get('/dominios', async (request, reply) => {
    const ctx = await requireGovernancaAdmin(request, reply);
    if (!ctx || (ctx as any).success === false) return;
    const rows = await prisma.governancaDadoDominio.findMany({
      where: { tenantId: ctx.tenantId, ativo: true },
      orderBy: [{ codigoDominio: 'asc' }],
    });
    return ok(reply, rows);
  });

  server.post(
    '/dominios',
    {
      schema: {
        body: z.object({
          codigoDominio: z.string().min(2),
          nomeDominio: z.string().min(2),
          descricaoDominio: z.string().optional().nullable(),
          ativo: z.boolean().default(true),
        }),
      },
    },
    async (request, reply) => {
      const ctx = await requireGovernancaAdmin(request, reply);
      if (!ctx || (ctx as any).success === false) return;
      const body = request.body as any;
      const created = await prisma.governancaDadoDominio.create({
        data: {
          tenantId: ctx.tenantId,
          codigoDominio: String(body.codigoDominio).toUpperCase(),
          nomeDominio: String(body.nomeDominio),
          descricaoDominio: body.descricaoDominio ?? null,
          ativo: body.ativo !== false,
        },
      });
      return ok(reply, { id: created.id }, { message: 'Domínio criado' });
    }
  );

  server.get('/ativos', async (request, reply) => {
    const ctx = await requireGovernancaAdmin(request, reply);
    if (!ctx || (ctx as any).success === false) return;
    const q = z
      .object({
        tipo: z.string().optional(),
        dominio: z.string().optional(),
        pagina: z.coerce.number().int().min(1).default(1),
        limite: z.coerce.number().int().min(1).max(100).default(30),
      })
      .parse(request.query || {});
    const where: any = { tenantId: ctx.tenantId };
    if (q.tipo) where.tipoAtivo = String(q.tipo).toUpperCase();
    if (q.dominio) {
      const dom = await prisma.governancaDadoDominio.findFirst({ where: { tenantId: ctx.tenantId, codigoDominio: String(q.dominio).toUpperCase() } });
      if (!dom) return ok(reply, [], { meta: { pagina: q.pagina, limite: q.limite, total: 0 } });
      where.dominioId = dom.id;
    }
    const skip = (q.pagina - 1) * q.limite;
    const [rows, total] = await Promise.all([
      prisma.governancaDadoAtivo.findMany({
        where,
        include: {
          dominio: { select: { nomeDominio: true } },
          ownerNegocio: { select: { name: true } },
          ownerTecnico: { select: { name: true } },
        },
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        skip,
        take: q.limite,
      }),
      prisma.governancaDadoAtivo.count({ where }),
    ]);
    return ok(
      reply,
      rows.map((r) => ({
        id: r.id,
        codigoAtivo: r.codigoAtivo,
        nomeAtivo: r.nomeAtivo,
        tipoAtivo: r.tipoAtivo,
        dominioNome: r.dominio?.nomeDominio || null,
        classificacaoGlobal: r.classificacaoGlobal,
        criticidadeNegocio: r.criticidadeNegocio,
        statusAtivo: r.statusAtivo,
        ownerNegocioNome: r.ownerNegocio?.name || null,
        ownerTecnicoNome: r.ownerTecnico?.name || null,
        slaFreshnessMinutos: r.slaFreshnessMinutos,
      })),
      { meta: { pagina: q.pagina, limite: q.limite, total } }
    );
  });

  server.post(
    '/ativos',
    {
      schema: {
        body: z.object({
          codigoAtivo: z.string().min(2),
          nomeAtivo: z.string().min(2),
          tipoAtivo: z.enum(['TABELA_OPERACIONAL', 'DW_DIM', 'DW_FACT', 'DW_MART', 'DATASET', 'API', 'RELATORIO']),
          dominioCodigo: z.string().optional().nullable(),
          classificacaoGlobal: z.enum(['PUBLICO', 'INTERNO', 'SENSIVEL', 'RESTRITO']).default('INTERNO'),
          criticidadeNegocio: z.enum(['BAIXA', 'MEDIA', 'ALTA', 'CRITICA']).default('MEDIA'),
          schemaNome: z.string().optional().nullable(),
          objetoNome: z.string().optional().nullable(),
          datasetKey: z.string().optional().nullable(),
          origemSistema: z.string().optional().nullable(),
        }),
      },
    },
    async (request, reply) => {
      const ctx = await requireGovernancaAdmin(request, reply);
      if (!ctx || (ctx as any).success === false) return;
      const body = request.body as any;
      let dominioId: number | null = null;
      if (body.dominioCodigo) {
        const dom = await prisma.governancaDadoDominio.findFirst({ where: { tenantId: ctx.tenantId, codigoDominio: String(body.dominioCodigo).toUpperCase() } });
        dominioId = dom?.id || null;
      }
      const created = await prisma.governancaDadoAtivo.create({
        data: {
          tenantId: ctx.tenantId,
          codigoAtivo: String(body.codigoAtivo),
          nomeAtivo: String(body.nomeAtivo),
          tipoAtivo: String(body.tipoAtivo),
          dominioId: dominioId,
          classificacaoGlobal: String(body.classificacaoGlobal),
          criticidadeNegocio: String(body.criticidadeNegocio),
          schemaNome: body.schemaNome ?? null,
          objetoNome: body.objetoNome ?? null,
          datasetKey: body.datasetKey ?? null,
          origemSistema: body.origemSistema ?? null,
        },
      });
      return ok(reply, { id: created.id }, { message: 'Ativo criado' });
    }
  );

  server.get('/ativos/:id', async (request, reply) => {
    const ctx = await requireGovernancaAdmin(request, reply);
    if (!ctx || (ctx as any).success === false) return;
    const { id } = z.object({ id: z.coerce.number().int() }).parse(request.params || {});
    const ativo = await prisma.governancaDadoAtivo.findUnique({
      where: { id },
      include: {
        dominio: { select: { codigoDominio: true, nomeDominio: true } },
        ownerNegocio: { select: { id: true, name: true } },
        ownerTecnico: { select: { id: true, name: true } },
        steward: { select: { id: true, name: true } },
        custodiante: { select: { id: true, name: true } },
      },
    });
    if (!ativo || ativo.tenantId !== ctx.tenantId) return fail(reply, 404, 'Ativo não encontrado');
    const score = await calcularScoreQualidadePorAtivo({ tenantId: ctx.tenantId, ativoId: id });
    return ok(reply, {
      id: ativo.id,
      codigoAtivo: ativo.codigoAtivo,
      nomeAtivo: ativo.nomeAtivo,
      tipoAtivo: ativo.tipoAtivo,
      descricaoAtivo: ativo.descricaoAtivo,
      origemSistema: ativo.origemSistema,
      schemaNome: ativo.schemaNome,
      objetoNome: ativo.objetoNome,
      datasetKey: ativo.datasetKey,
      classificacaoGlobal: ativo.classificacaoGlobal,
      criticidadeNegocio: ativo.criticidadeNegocio,
      slaFreshnessMinutos: ativo.slaFreshnessMinutos,
      statusAtivo: ativo.statusAtivo,
      dominio: ativo.dominio,
      ownerNegocio: ativo.ownerNegocio,
      ownerTecnico: ativo.ownerTecnico,
      steward: ativo.steward,
      custodiante: ativo.custodiante,
      metadataJson: ativo.metadataJson,
      qualidade: score,
      createdAt: ativo.createdAt.toISOString(),
      updatedAt: ativo.updatedAt.toISOString(),
    });
  });

  server.get('/ativos/:id/campos', async (request, reply) => {
    const ctx = await requireGovernancaAdmin(request, reply);
    if (!ctx || (ctx as any).success === false) return;
    const { id } = z.object({ id: z.coerce.number().int() }).parse(request.params || {});
    const ativo = await prisma.governancaDadoAtivo.findUnique({ where: { id } }).catch(() => null);
    if (!ativo || ativo.tenantId !== ctx.tenantId) return fail(reply, 404, 'Ativo não encontrado');
    const campos = await prisma.governancaDadoAtivoCampo.findMany({ where: { ativoId: id }, orderBy: [{ caminhoCampo: 'asc' }] });
    return ok(reply, campos);
  });

  server.post(
    '/ativos/:id/campos',
    {
      schema: {
        params: z.object({ id: z.coerce.number().int() }),
        body: z.object({
          caminhoCampo: z.string().min(1),
          nomeCampoExibicao: z.string().min(1),
          tipoDado: z.string().min(1),
          descricaoCampo: z.string().optional().nullable(),
          classificacaoCampo: z.enum(['PUBLICO', 'INTERNO', 'SENSIVEL', 'RESTRITO']).default('INTERNO'),
          pii: z.boolean().default(false),
          campoChave: z.boolean().default(false),
          campoObrigatorio: z.boolean().default(false),
          campoMascaravel: z.boolean().default(false),
          estrategiaMascaraPadrao: z.string().optional().nullable(),
          origemCampo: z.string().optional().nullable(),
          ativo: z.boolean().default(true),
          metadataJson: z.unknown().optional().nullable(),
        }),
      },
    },
    async (request, reply) => {
      const ctx = await requireGovernancaAdmin(request, reply);
      if (!ctx || (ctx as any).success === false) return;
      const { id } = request.params as any;
      const body = request.body as any;
      const ativo = await prisma.governancaDadoAtivo.findUnique({ where: { id: Number(id) } }).catch(() => null);
      if (!ativo || ativo.tenantId !== ctx.tenantId) return fail(reply, 404, 'Ativo não encontrado');
      const saved = await prisma.governancaDadoAtivoCampo.upsert({
        where: { ativoId_caminhoCampo: { ativoId: ativo.id, caminhoCampo: String(body.caminhoCampo) } },
        create: {
          ativoId: ativo.id,
          caminhoCampo: String(body.caminhoCampo),
          nomeCampoExibicao: String(body.nomeCampoExibicao),
          tipoDado: String(body.tipoDado),
          descricaoCampo: body.descricaoCampo ?? null,
          classificacaoCampo: String(body.classificacaoCampo),
          pii: Boolean(body.pii),
          campoChave: Boolean(body.campoChave),
          campoObrigatorio: Boolean(body.campoObrigatorio),
          campoMascaravel: Boolean(body.campoMascaravel),
          estrategiaMascaraPadrao: body.estrategiaMascaraPadrao ?? null,
          origemCampo: body.origemCampo ?? null,
          ativo: body.ativo !== false,
          metadataJson: body.metadataJson ?? null,
        },
        update: {
          nomeCampoExibicao: String(body.nomeCampoExibicao),
          tipoDado: String(body.tipoDado),
          descricaoCampo: body.descricaoCampo ?? null,
          classificacaoCampo: String(body.classificacaoCampo),
          pii: Boolean(body.pii),
          campoChave: Boolean(body.campoChave),
          campoObrigatorio: Boolean(body.campoObrigatorio),
          campoMascaravel: Boolean(body.campoMascaravel),
          estrategiaMascaraPadrao: body.estrategiaMascaraPadrao ?? null,
          origemCampo: body.origemCampo ?? null,
          ativo: body.ativo !== false,
          metadataJson: body.metadataJson ?? null,
        },
      });
      return ok(reply, saved, { message: 'Campo salvo' });
    }
  );

  server.get('/ativos/:id/lineage', async (request, reply) => {
    const ctx = await requireGovernancaAdmin(request, reply);
    if (!ctx || (ctx as any).success === false) return;
    const { id } = z.object({ id: z.coerce.number().int() }).parse(request.params || {});
    const ativo = await prisma.governancaDadoAtivo.findUnique({ where: { id } }).catch(() => null);
    if (!ativo || ativo.tenantId !== ctx.tenantId) return fail(reply, 404, 'Ativo não encontrado');
    const rows = await prisma.governancaDadoLineageRelacao.findMany({
      where: { tenantId: ctx.tenantId, OR: [{ ativoOrigemId: id }, { ativoDestinoId: id }] },
      include: {
        ativoOrigem: { select: { id: true, nomeAtivo: true } },
        ativoDestino: { select: { id: true, nomeAtivo: true } },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    const data = rows.map((r) => ({
      ativoOrigemId: r.ativoOrigemId,
      ativoOrigemNome: r.ativoOrigem.nomeAtivo,
      ativoDestinoId: r.ativoDestinoId,
      ativoDestinoNome: r.ativoDestino.nomeAtivo,
      tipoRelacao: r.tipoRelacao,
      nivelRelacao: r.nivelRelacao,
      campoOrigem: r.campoOrigem,
      campoDestino: r.campoDestino,
    }));
    return ok(reply, data);
  });

  server.post(
    '/lineage',
    {
      schema: {
        body: z.object({
          ativoOrigemId: z.number().int(),
          ativoDestinoId: z.number().int(),
          tipoRelacao: z.enum(['ALIMENTA', 'TRANSFORMA', 'AGREGA', 'EXPOE', 'EXPORTA']),
          nivelRelacao: z.enum(['ATIVO', 'CAMPO']).default('ATIVO'),
          campoOrigem: z.string().optional().nullable(),
          campoDestino: z.string().optional().nullable(),
          transformacaoResumo: z.string().optional().nullable(),
          pipelineNome: z.string().optional().nullable(),
          ativo: z.boolean().default(true),
        }),
      },
    },
    async (request, reply) => {
      const ctx = await requireGovernancaAdmin(request, reply);
      if (!ctx || (ctx as any).success === false) return;
      const body = request.body as any;
      const origem = await prisma.governancaDadoAtivo.findUnique({ where: { id: body.ativoOrigemId } }).catch(() => null);
      const destino = await prisma.governancaDadoAtivo.findUnique({ where: { id: body.ativoDestinoId } }).catch(() => null);
      if (!origem || origem.tenantId !== ctx.tenantId) return fail(reply, 404, 'Ativo origem inválido');
      if (!destino || destino.tenantId !== ctx.tenantId) return fail(reply, 404, 'Ativo destino inválido');

      const created = await prisma.governancaDadoLineageRelacao.create({
        data: {
          tenantId: ctx.tenantId,
          ativoOrigemId: origem.id,
          ativoDestinoId: destino.id,
          tipoRelacao: String(body.tipoRelacao),
          nivelRelacao: String(body.nivelRelacao),
          campoOrigem: body.campoOrigem ?? null,
          campoDestino: body.campoDestino ?? null,
          transformacaoResumo: body.transformacaoResumo ?? null,
          pipelineNome: body.pipelineNome ?? null,
          ativo: body.ativo !== false,
        },
      });
      return ok(reply, { id: created.id }, { message: 'Lineage criado' });
    }
  );

  server.get('/glossario', async (request, reply) => {
    const ctx = await requireGovernancaAdmin(request, reply);
    if (!ctx || (ctx as any).success === false) return;
    const q = z
      .object({
        termo: z.string().optional(),
        dominio: z.string().optional(),
        pagina: z.coerce.number().int().min(1).default(1),
        limite: z.coerce.number().int().min(1).max(100).default(30),
      })
      .parse(request.query || {});
    const where: any = { tenantId: ctx.tenantId, ativo: true };
    if (q.termo) where.termo = { contains: q.termo, mode: 'insensitive' };
    if (q.dominio) {
      const dom = await prisma.governancaDadoDominio.findFirst({ where: { tenantId: ctx.tenantId, codigoDominio: String(q.dominio).toUpperCase() } });
      if (!dom) return ok(reply, [], { meta: { pagina: q.pagina, limite: q.limite, total: 0 } });
      where.dominioId = dom.id;
    }
    const skip = (q.pagina - 1) * q.limite;
    const [rows, total] = await Promise.all([
      prisma.governancaDadoGlossario.findMany({
        where,
        include: { dominio: { select: { codigoDominio: true, nomeDominio: true } }, ownerRef: { select: { id: true, name: true } } },
        orderBy: [{ termo: 'asc' }],
        skip,
        take: q.limite,
      }),
      prisma.governancaDadoGlossario.count({ where }),
    ]);
    return ok(
      reply,
      rows.map((r) => ({
        id: r.id,
        termo: r.termo,
        definicao: r.definicao,
        formulaNegocio: r.formulaNegocio,
        exemplosJson: r.exemplosJson,
        dominio: r.dominio,
        owner: r.ownerRef,
        ativo: r.ativo,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
      })),
      { meta: { pagina: q.pagina, limite: q.limite, total } }
    );
  });

  server.post(
    '/glossario',
    {
      schema: {
        body: z.object({
          termo: z.string().min(2),
          definicao: z.string().min(5),
          formulaNegocio: z.string().optional().nullable(),
          exemplosJson: z.unknown().optional().nullable(),
          dominioCodigo: z.string().optional().nullable(),
          ownerUserId: z.number().int().optional().nullable(),
          ativo: z.boolean().default(true),
        }),
      },
    },
    async (request, reply) => {
      const ctx = await requireGovernancaAdmin(request, reply);
      if (!ctx || (ctx as any).success === false) return;
      const body = request.body as any;
      let dominioId: number | null = null;
      if (body.dominioCodigo) {
        const dom = await prisma.governancaDadoDominio.findFirst({ where: { tenantId: ctx.tenantId, codigoDominio: String(body.dominioCodigo).toUpperCase() } });
        dominioId = dom?.id || null;
      }
      const created = await prisma.governancaDadoGlossario.create({
        data: {
          tenantId: ctx.tenantId,
          termo: String(body.termo),
          definicao: String(body.definicao),
          formulaNegocio: body.formulaNegocio ?? null,
          exemplosJson: body.exemplosJson ?? null,
          dominioId,
          ownerUserId: typeof body.ownerUserId === 'number' ? body.ownerUserId : null,
          ativo: body.ativo !== false,
        },
      });
      return ok(reply, { id: created.id }, { message: 'Termo criado' });
    }
  );

  server.get('/qualidade/ativos/:id/regras', async (request, reply) => {
    const ctx = await requireGovernancaAdmin(request, reply);
    if (!ctx || (ctx as any).success === false) return;
    const { id } = z.object({ id: z.coerce.number().int() }).parse(request.params || {});
    const ativo = await prisma.governancaDadoAtivo.findUnique({ where: { id } }).catch(() => null);
    if (!ativo || ativo.tenantId !== ctx.tenantId) return fail(reply, 404, 'Ativo não encontrado');
    const rows = await prisma.governancaDadoQualidadeRegra.findMany({
      where: { tenantId: ctx.tenantId, ativoId: id },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
    });
    return ok(
      reply,
      rows.map((r) => ({
        id: r.id,
        nomeRegra: r.nomeRegra,
        tipoRegra: r.tipoRegra,
        caminhoCampo: r.caminhoCampo,
        severidade: r.severidade,
        ativo: r.ativo,
      }))
    );
  });

  server.get('/qualidade/regras', async (request, reply) => {
    const ctx = await requireGovernancaAdmin(request, reply);
    if (!ctx || (ctx as any).success === false) return;
    const q = z
      .object({
        ativoId: z.coerce.number().int().optional(),
        pagina: z.coerce.number().int().min(1).default(1),
        limite: z.coerce.number().int().min(1).max(100).default(30),
      })
      .parse(request.query || {});
    const where: any = { tenantId: ctx.tenantId };
    if (typeof q.ativoId === 'number') where.ativoId = q.ativoId;
    const skip = (q.pagina - 1) * q.limite;
    const [rows, total] = await Promise.all([
      prisma.governancaDadoQualidadeRegra.findMany({
        where,
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        skip,
        take: q.limite,
        select: { id: true, ativoId: true, nomeRegra: true, tipoRegra: true, caminhoCampo: true, severidade: true, ativo: true, configuracaoJson: true },
      }),
      prisma.governancaDadoQualidadeRegra.count({ where }),
    ]);
    return ok(reply, rows, { meta: { pagina: q.pagina, limite: q.limite, total } });
  });

  server.post(
    '/qualidade/regras',
    {
      schema: {
        body: z.object({
          ativoId: z.number().int(),
          caminhoCampo: z.string().optional().nullable(),
          nomeRegra: z.string().min(2),
          tipoRegra: z.enum(['COMPLETUDE', 'UNICIDADE', 'FAIXA', 'VALIDADE', 'REFERENCIAL', 'FRESHNESS', 'VOLUME', 'CONSISTENCIA']),
          severidade: z.enum(['BAIXA', 'MEDIA', 'ALTA', 'CRITICA']).default('MEDIA'),
          configuracaoJson: z.unknown(),
          thresholdOk: z.number().optional().nullable(),
          thresholdAlerta: z.number().optional().nullable(),
          ativo: z.boolean().default(true),
        }),
      },
    },
    async (request, reply) => {
      const ctx = await requireGovernancaAdmin(request, reply);
      if (!ctx || (ctx as any).success === false) return;
      const body = request.body as any;
      const ativo = await prisma.governancaDadoAtivo.findUnique({ where: { id: body.ativoId } }).catch(() => null);
      if (!ativo || ativo.tenantId !== ctx.tenantId) return fail(reply, 404, 'Ativo não encontrado');

      const created = await prisma.governancaDadoQualidadeRegra.create({
        data: {
          tenantId: ctx.tenantId,
          ativoId: ativo.id,
          caminhoCampo: body.caminhoCampo ?? null,
          nomeRegra: String(body.nomeRegra),
          tipoRegra: String(body.tipoRegra),
          severidade: String(body.severidade),
          configuracaoJson: body.configuracaoJson as any,
          thresholdOk: body.thresholdOk !== null && body.thresholdOk !== undefined ? body.thresholdOk : null,
          thresholdAlerta: body.thresholdAlerta !== null && body.thresholdAlerta !== undefined ? body.thresholdAlerta : null,
          ativo: body.ativo !== false,
          criadoPorUserId: ctx.userId,
          atualizadoPorUserId: ctx.userId,
        },
      });
      return ok(reply, { id: created.id }, { message: 'Regra criada' });
    }
  );

  server.put(
    '/qualidade/regras/:id',
    {
      schema: {
        params: z.object({ id: z.coerce.number().int() }),
        body: z.object({
          caminhoCampo: z.string().optional().nullable(),
          nomeRegra: z.string().min(2),
          tipoRegra: z.enum(['COMPLETUDE', 'UNICIDADE', 'FAIXA', 'VALIDADE', 'REFERENCIAL', 'FRESHNESS', 'VOLUME', 'CONSISTENCIA']),
          severidade: z.enum(['BAIXA', 'MEDIA', 'ALTA', 'CRITICA']).default('MEDIA'),
          configuracaoJson: z.unknown(),
          thresholdOk: z.number().optional().nullable(),
          thresholdAlerta: z.number().optional().nullable(),
          ativo: z.boolean().default(true),
        }),
      },
    },
    async (request, reply) => {
      const ctx = await requireGovernancaAdmin(request, reply);
      if (!ctx || (ctx as any).success === false) return;
      const { id } = request.params as any;
      const body = request.body as any;
      const regra = await prisma.governancaDadoQualidadeRegra.findUnique({ where: { id: Number(id) } }).catch(() => null);
      if (!regra || regra.tenantId !== ctx.tenantId) return fail(reply, 404, 'Regra não encontrada');
      const updated = await prisma.governancaDadoQualidadeRegra.update({
        where: { id: Number(id) },
        data: {
          caminhoCampo: body.caminhoCampo ?? null,
          nomeRegra: String(body.nomeRegra),
          tipoRegra: String(body.tipoRegra),
          severidade: String(body.severidade),
          configuracaoJson: body.configuracaoJson as any,
          thresholdOk: body.thresholdOk !== null && body.thresholdOk !== undefined ? body.thresholdOk : null,
          thresholdAlerta: body.thresholdAlerta !== null && body.thresholdAlerta !== undefined ? body.thresholdAlerta : null,
          ativo: body.ativo !== false,
          atualizadoPorUserId: ctx.userId,
        },
      });
      return ok(reply, { id: updated.id }, { message: 'Regra atualizada' });
    }
  );

  server.post('/qualidade/regras/:id/executar', async (request, reply) => {
    const ctx = await requireGovernancaAdmin(request, reply);
    if (!ctx || (ctx as any).success === false) return;
    const { id } = z.object({ id: z.coerce.number().int() }).parse(request.params || {});
    const regra = await prisma.governancaDadoQualidadeRegra.findUnique({ where: { id } }).catch(() => null);
    if (!regra || regra.tenantId !== ctx.tenantId) return fail(reply, 404, 'Regra não encontrada');
    const ativo = await prisma.governancaDadoAtivo.findUnique({ where: { id: regra.ativoId } }).catch(() => null);
    if (!ativo || ativo.tenantId !== ctx.tenantId) return fail(reply, 404, 'Ativo não encontrado');

    const tipo = String(regra.tipoRegra || '').toUpperCase();
    const objeto = ativo.objetoNome ? String(ativo.objetoNome) : null;

    let statusExecucao: 'OK' | 'ALERTA' | 'FALHA' | 'ERRO' = 'OK';
    let totalRegistros: number | null = null;
    let totalInconsistencias: number | null = null;
    let valorApurado: number | null = null;
    let mensagemResultado: string | null = null;

    try {
      if (tipo === 'FRESHNESS') {
        const cfg = regra.configuracaoJson as any;
        const maxDelayMinutes = Number(cfg?.maxDelayMinutes ?? ativo.slaFreshnessMinutos ?? 60);
        const referenceField = String(cfg?.referenceField || 'updatedAt');
        if (!objeto || !(prisma as any)[objeto]) throw new Error('OBJETO_NAO_SUPORTADO');
        const row = await (prisma as any)[objeto].findFirst({ orderBy: { [referenceField]: 'desc' }, select: { [referenceField]: true } });
        const dt = row?.[referenceField] ? new Date(row[referenceField]) : null;
        if (!dt || Number.isNaN(dt.getTime())) throw new Error('SEM_REFERENCIA');
        const delayMin = Math.floor((Date.now() - dt.getTime()) / 60000);
        valorApurado = delayMin;
        if (delayMin > maxDelayMinutes) statusExecucao = 'FALHA';
        else if (delayMin > Math.floor(maxDelayMinutes * 0.7)) statusExecucao = 'ALERTA';
        mensagemResultado = `delay_min=${delayMin}`;
      } else if (tipo === 'COMPLETUDE') {
        const cfg = regra.configuracaoJson as any;
        const field = String(cfg?.field || regra.caminhoCampo || '');
        if (!field) throw new Error('FIELD_REQUIRED');
        if (!objeto || !(prisma as any)[objeto]) throw new Error('OBJETO_NAO_SUPORTADO');
        const total = await (prisma as any)[objeto].count();
        const missing = await (prisma as any)[objeto].count({ where: { OR: [{ [field]: null }, { [field]: '' }] } });
        totalRegistros = total;
        totalInconsistencias = missing;
        const okRate = total ? (total - missing) / total : 1;
        valorApurado = Number(okRate.toFixed(6));
        const thOk = regra.thresholdOk !== null && regra.thresholdOk !== undefined ? Number(regra.thresholdOk) : 0.98;
        const thAlerta = regra.thresholdAlerta !== null && regra.thresholdAlerta !== undefined ? Number(regra.thresholdAlerta) : 0.9;
        if (okRate < thAlerta) statusExecucao = 'FALHA';
        else if (okRate < thOk) statusExecucao = 'ALERTA';
        mensagemResultado = `ok_rate=${okRate}`;
      } else if (tipo === 'FAIXA') {
        const cfg = regra.configuracaoJson as any;
        const field = String(cfg?.field || regra.caminhoCampo || '');
        const min = cfg?.min !== undefined && cfg?.min !== null ? Number(cfg.min) : null;
        const max = cfg?.max !== undefined && cfg?.max !== null ? Number(cfg.max) : null;
        if (!field || min === null || max === null) throw new Error('CONFIG_INVALIDA');
        if (!objeto || !(prisma as any)[objeto]) throw new Error('OBJETO_NAO_SUPORTADO');
        const total = await (prisma as any)[objeto].count();
        const out = await (prisma as any)[objeto].count({ where: { OR: [{ [field]: { lt: min } }, { [field]: { gt: max } }] } });
        totalRegistros = total;
        totalInconsistencias = out;
        const okRate = total ? (total - out) / total : 1;
        valorApurado = Number(okRate.toFixed(6));
        const thOk = regra.thresholdOk !== null && regra.thresholdOk !== undefined ? Number(regra.thresholdOk) : 0.98;
        const thAlerta = regra.thresholdAlerta !== null && regra.thresholdAlerta !== undefined ? Number(regra.thresholdAlerta) : 0.9;
        if (okRate < thAlerta) statusExecucao = 'FALHA';
        else if (okRate < thOk) statusExecucao = 'ALERTA';
        mensagemResultado = `ok_rate=${okRate}`;
      } else {
        statusExecucao = 'ERRO';
        mensagemResultado = 'Tipo de regra ainda não executável neste estágio.';
      }
    } catch (e: any) {
      statusExecucao = 'ERRO';
      mensagemResultado = String(e?.message || 'Erro ao executar regra');
    }

    const exec = await prisma.governancaDadoQualidadeExecucao.create({
      data: {
        tenantId: ctx.tenantId,
        regraId: regra.id,
        statusExecucao,
        valorApurado: valorApurado !== null ? valorApurado : null,
        thresholdOk: regra.thresholdOk ?? null,
        thresholdAlerta: regra.thresholdAlerta ?? null,
        totalRegistros: totalRegistros !== null ? totalRegistros : null,
        totalInconsistencias: totalInconsistencias !== null ? totalInconsistencias : null,
        amostraJson: Prisma.DbNull,
        mensagemResultado,
      },
    });

    if (statusExecucao === 'FALHA' || statusExecucao === 'ALERTA') {
      const now = new Date();
      const titulo = `${tipo} ${regra.nomeRegra}`;
      const existing = await prisma.governancaDadoQualidadeIssue.findFirst({
        where: { tenantId: ctx.tenantId, ativoId: regra.ativoId, regraId: regra.id, statusIssue: { in: ['ABERTA', 'EM_TRATAMENTO'] } },
        orderBy: { id: 'desc' },
      });
      if (existing) {
        await prisma.governancaDadoQualidadeIssue.update({
          where: { id: existing.id },
          data: { ultimaOcorrenciaEm: now, severidade: regra.severidade, metadataJson: { lastExecId: exec.id, statusExecucao } as any },
        });
      } else {
        await prisma.governancaDadoQualidadeIssue.create({
          data: {
            tenantId: ctx.tenantId,
            ativoId: regra.ativoId,
            regraId: regra.id,
            tituloIssue: titulo,
            descricaoIssue: mensagemResultado,
            severidade: regra.severidade,
            statusIssue: 'ABERTA',
            responsavelUserId: null,
            primeiraOcorrenciaEm: now,
            ultimaOcorrenciaEm: now,
            metadataJson: { firstExecId: exec.id, statusExecucao } as any,
          },
        });
      }
    }

    const score = await calcularScoreQualidadePorAtivo({ tenantId: ctx.tenantId, ativoId: regra.ativoId });
    return ok(reply, { execucaoId: exec.id, statusExecucao, mensagemResultado, score }, { message: 'Execução registrada' });
  });

  server.get('/qualidade/ativos/:id/issues', async (request, reply) => {
    const ctx = await requireGovernancaAdmin(request, reply);
    if (!ctx || (ctx as any).success === false) return;
    const { id } = z.object({ id: z.coerce.number().int() }).parse(request.params || {});
    const ativo = await prisma.governancaDadoAtivo.findUnique({ where: { id } }).catch(() => null);
    if (!ativo || ativo.tenantId !== ctx.tenantId) return fail(reply, 404, 'Ativo não encontrado');
    const rows = await prisma.governancaDadoQualidadeIssue.findMany({
      where: { tenantId: ctx.tenantId, ativoId: id },
      include: { responsavelRef: { select: { name: true } } },
      orderBy: [{ ultimaOcorrenciaEm: 'desc' }, { id: 'desc' }],
    });
    return ok(
      reply,
      rows.map((r) => ({
        id: r.id,
        tituloIssue: r.tituloIssue,
        severidade: r.severidade,
        statusIssue: r.statusIssue,
        ultimaOcorrenciaEm: r.ultimaOcorrenciaEm.toISOString(),
        responsavelNome: r.responsavelRef?.name || null,
      }))
    );
  });

  server.get('/qualidade/issues', async (request, reply) => {
    const ctx = await requireGovernancaAdmin(request, reply);
    if (!ctx || (ctx as any).success === false) return;
    const q = z
      .object({
        status: z.string().optional(),
        severidade: z.string().optional(),
        pagina: z.coerce.number().int().min(1).default(1),
        limite: z.coerce.number().int().min(1).max(100).default(30),
      })
      .parse(request.query || {});
    const where: any = { tenantId: ctx.tenantId };
    if (q.status) where.statusIssue = String(q.status).toUpperCase();
    if (q.severidade) where.severidade = String(q.severidade).toUpperCase();
    const skip = (q.pagina - 1) * q.limite;
    const [rows, total] = await Promise.all([
      prisma.governancaDadoQualidadeIssue.findMany({
        where,
        include: { responsavelRef: { select: { name: true } }, ativoRef: { select: { nomeAtivo: true, codigoAtivo: true } } },
        orderBy: [{ ultimaOcorrenciaEm: 'desc' }, { id: 'desc' }],
        skip,
        take: q.limite,
      }),
      prisma.governancaDadoQualidadeIssue.count({ where }),
    ]);
    return ok(
      reply,
      rows.map((r) => ({
        id: r.id,
        ativoId: r.ativoId,
        ativoNome: r.ativoRef?.nomeAtivo || null,
        ativoCodigo: r.ativoRef?.codigoAtivo || null,
        regraId: r.regraId,
        tituloIssue: r.tituloIssue,
        severidade: r.severidade,
        statusIssue: r.statusIssue,
        ultimaOcorrenciaEm: r.ultimaOcorrenciaEm.toISOString(),
        responsavelNome: r.responsavelRef?.name || null,
      })),
      { meta: { pagina: q.pagina, limite: q.limite, total } }
    );
  });

  server.post(
    '/simular',
    {
      schema: {
        body: z.object({
          ativoId: z.number().int(),
        }),
      },
    },
    async (request, reply) => {
      const ctx = await requireGovernancaAdmin(request, reply);
      if (!ctx || (ctx as any).success === false) return;
      const body = request.body as any;
      const ativo = await prisma.governancaDadoAtivo.findUnique({ where: { id: body.ativoId } }).catch(() => null);
      if (!ativo || ativo.tenantId !== ctx.tenantId) return fail(reply, 404, 'Ativo não encontrado');
      const score = await calcularScoreQualidadePorAtivo({ tenantId: ctx.tenantId, ativoId: ativo.id });
      const campos = await prisma.governancaDadoAtivoCampo.findMany({ where: { ativoId: ativo.id, ativo: true } });
      const sensitive = campos.filter((c) => String(c.classificacaoCampo).toUpperCase() === 'SENSIVEL' || String(c.classificacaoCampo).toUpperCase() === 'RESTRITO').length;
      return ok(reply, { ativoId: ativo.id, camposTotal: campos.length, camposSensiveis: sensitive, qualidade: score });
    }
  );
}

