import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import crypto from 'crypto';
import prisma from '../../plugins/prisma.js';
import { authenticate } from '../../utils/authenticate.js';

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
  if (typeof tenantId !== 'number' || typeof userId !== 'number') return null;
  return { tenantId, userId, role: typeof role === 'string' ? role : 'USER', email: typeof u?.email === 'string' ? u.email : '' };
}

async function requireTenantUser(request: FastifyRequest, reply: FastifyReply) {
  const ctx = getAuthContext(request);
  if (!ctx) return fail(reply, 401, 'Não autenticado');
  const tenantUser = await prisma.tenantUser.findUnique({
    where: { tenantId_userId: { tenantId: ctx.tenantId, userId: ctx.userId } },
    select: { id: true },
  });
  if (!tenantUser) return fail(reply, 403, 'Tenant não selecionado');
  return { ...ctx, tenantUserId: tenantUser.id };
}

function baseApiUrlFromEnvOrRequest(request: FastifyRequest) {
  const env = String(process.env.PUBLIC_API_URL || '').trim().replace(/\/$/, '');
  if (env) return env;
  const proto = String(request.headers['x-forwarded-proto'] || request.protocol || 'https').split(',')[0].trim() || 'https';
  const host = String(request.headers['x-forwarded-host'] || request.headers.host || '').split(',')[0].trim();
  if (!host) return '';
  return `${proto}://${host}`;
}

function sha256Hex(buf: Buffer) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function parseIdOrFail(reply: FastifyReply, params: unknown, notFoundMessage: string) {
  const parsed = z.object({ id: z.coerce.number().int().positive() }).safeParse(params ?? {});
  if (!parsed.success) {
    fail(reply, 404, notFoundMessage);
    return null;
  }
  return parsed.data.id;
}

async function toBufferFromMultipart(filePart: any): Promise<Buffer> {
  if (!filePart) return Buffer.from([]);
  if (typeof filePart.toBuffer === 'function') return (await filePart.toBuffer()) as Buffer;
  const stream: any = filePart.file || filePart;
  if (!stream || typeof stream.on !== 'function') return Buffer.from([]);
  const chunks: Buffer[] = [];
  await new Promise<void>((resolve, reject) => {
    stream.on('data', (c: Buffer) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
    stream.on('end', () => resolve());
    stream.on('error', (e: any) => reject(e));
  });
  return Buffer.concat(chunks);
}

function mapDocumentoDTO(d: any) {
  const entidadeTipo = d.contratoId ? 'CONTRATO' : d.obraId ? 'OBRA' : null;
  const entidadeId = d.contratoId ? Number(d.contratoId) : d.obraId ? Number(d.obraId) : null;
  return {
    id: Number(d.id),
    entidadeTipo,
    entidadeId,
    categoriaDocumento: String(d.categoriaDocumento || d.type || 'OBRA:OUTROS'),
    tituloDocumento: String(d.tituloDocumento || d.name || ''),
    descricaoDocumento: d.descricaoDocumento != null ? String(d.descricaoDocumento) : null,
    statusDocumento: String(d.statusDocumento || 'ATIVO'),
    idVersaoAtual: d.idVersaoAtual != null ? Number(d.idVersaoAtual) : null,
    criadoEm: d.uploadedAt instanceof Date ? d.uploadedAt.toISOString() : new Date(String(d.uploadedAt || new Date().toISOString())).toISOString(),
    atualizadoEm: d.updatedAt instanceof Date ? d.updatedAt.toISOString() : new Date(String(d.updatedAt || d.uploadedAt || new Date().toISOString())).toISOString(),
  };
}

function mapVersaoDTO(v: any) {
  return {
    id: Number(v.id),
    idDocumentoRegistro: Number(v.documentoId),
    numeroVersao: Number(v.numeroVersao || 1),
    nomeArquivoOriginal: String(v.nomeArquivoOriginal || ''),
    mimeType: String(v.mimeType || 'application/octet-stream'),
    tamanhoBytes: Number(v.tamanhoBytes || 0),
    hashSha256Original: String(v.hashSha256Original || ''),
    hashSha256PdfCarimbado: v.hashSha256PdfCarimbado != null ? String(v.hashSha256PdfCarimbado) : null,
    statusVersao: String(v.statusVersao || 'ATIVA'),
    finalizadaEm: v.finalizadaEm instanceof Date ? v.finalizadaEm.toISOString() : v.finalizadaEm ? new Date(String(v.finalizadaEm)).toISOString() : null,
    criadoEm: v.createdAt instanceof Date ? v.createdAt.toISOString() : new Date(String(v.createdAt || new Date().toISOString())).toISOString(),
  };
}

export default async function documentosRoutes(server: FastifyInstance) {
  server.addHook('onRequest', authenticate);

  server.get('/', async (request, reply) => {
    const ctx = await requireTenantUser(request, reply);
    if (!ctx || (ctx as any).success === false) return;

    const q = z
      .object({
        limit: z.coerce.number().int().optional(),
        entidadeTipo: z.string().optional().nullable(),
        entidadeId: z.coerce.number().int().optional().nullable(),
        categoriaPrefix: z.string().optional().nullable(),
        incluirObrasDoContrato: z.coerce.number().int().optional(),
      })
      .parse((request.query as any) || {});

    const limit = Math.min(500, Math.max(1, Number(q.limit || 200)));
    const entidadeTipo = q.entidadeTipo ? String(q.entidadeTipo).trim().toUpperCase() : null;
    const entidadeId = q.entidadeId != null ? Number(q.entidadeId) : null;
    const categoriaPrefix = q.categoriaPrefix ? String(q.categoriaPrefix).trim().toUpperCase() : null;
    const incluirObrasDoContrato = Number(q.incluirObrasDoContrato || 0) === 1;

    const whereBase: any = { tenantId: ctx.tenantId };
    if (categoriaPrefix) whereBase.categoriaDocumento = { startsWith: categoriaPrefix };

    let where: any = whereBase;
    if (entidadeTipo === 'OBRA' && entidadeId) {
      where = { ...whereBase, obraId: entidadeId };
    } else if (entidadeTipo === 'CONTRATO' && entidadeId) {
      if (incluirObrasDoContrato) {
        const obras = await prisma.obra.findMany({ where: { tenantId: ctx.tenantId, contratoId: entidadeId }, select: { id: true }, take: 5000 });
        const ids = obras.map((o) => o.id);
        where = { ...whereBase, OR: [{ contratoId: entidadeId }, ...(ids.length ? [{ obraId: { in: ids } }] : [])] };
      } else {
        where = { ...whereBase, contratoId: entidadeId };
      }
    }

    const rows = await prisma.documento.findMany({
      where,
      orderBy: [{ uploadedAt: 'desc' }, { id: 'desc' }],
      take: limit,
    });

    return ok(reply, rows.map(mapDocumentoDTO));
  });

  server.post(
    '/',
    {
      schema: {
        body: z.object({
          entidadeTipo: z.string().optional().nullable(),
          entidadeId: z.number().int().optional().nullable(),
          categoriaDocumento: z.string().min(2),
          tituloDocumento: z.string().min(1),
          descricaoDocumento: z.string().optional().nullable(),
        }),
      },
    },
    async (request, reply) => {
      const ctx = await requireTenantUser(request, reply);
      if (!ctx || (ctx as any).success === false) return;

      const body = request.body as any;
      const entidadeTipo = body.entidadeTipo ? String(body.entidadeTipo).trim().toUpperCase() : null;
      const entidadeId = body.entidadeId != null ? Number(body.entidadeId) : null;
      const categoriaDocumento = String(body.categoriaDocumento).trim().toUpperCase();
      const tituloDocumento = String(body.tituloDocumento).trim();
      const descricaoDocumento = body.descricaoDocumento != null ? String(body.descricaoDocumento).trim() : null;

      const obraId = entidadeTipo === 'OBRA' && entidadeId ? entidadeId : null;
      const contratoId = entidadeTipo === 'CONTRATO' && entidadeId ? entidadeId : null;
      if (entidadeTipo && !obraId && !contratoId) return fail(reply, 400, 'Entidade inválida');

      const baseUrl = baseApiUrlFromEnvOrRequest(request);
      const created = await prisma.documento.create({
        data: {
          tenantId: ctx.tenantId,
          obraId,
          contratoId,
          name: tituloDocumento,
          type: categoriaDocumento,
          url: baseUrl ? `${baseUrl}/api/v1/documentos/0/download` : 'about:blank',
          categoriaDocumento,
          tituloDocumento,
          descricaoDocumento: descricaoDocumento || null,
          statusDocumento: 'ATIVO',
        } as any,
        select: { id: true },
      });

      const url = baseUrl ? `${baseUrl}/api/v1/documentos/${created.id}/download` : `/api/v1/documentos/${created.id}/download`;
      await prisma.documento.update({ where: { id: created.id }, data: { url } });

      return ok(reply, { id: created.id }, { message: 'Documento criado' });
    }
  );

  server.get('/:id', async (request, reply) => {
    const ctx = await requireTenantUser(request, reply);
    if (!ctx || (ctx as any).success === false) return;
    const id = parseIdOrFail(reply, request.params, 'Documento não encontrado');
    if (!id) return;

    const doc = await prisma.documento.findUnique({ where: { id } }).catch(() => null);
    if (!doc || doc.tenantId !== ctx.tenantId) return fail(reply, 404, 'Documento não encontrado');

    const versoes = await prisma.documentoVersao.findMany({
      where: { tenantId: ctx.tenantId, documentoId: doc.id },
      orderBy: [{ numeroVersao: 'desc' }, { id: 'desc' }],
      take: 200,
    });

    return ok(reply, { documento: mapDocumentoDTO(doc), versoes: versoes.map(mapVersaoDTO) });
  });

  server.put(
    '/:id',
    {
      schema: {
        body: z.object({
          tituloDocumento: z.string().min(1).optional(),
          descricaoDocumento: z.string().optional().nullable(),
        }),
      },
    },
    async (request, reply) => {
      const ctx = await requireTenantUser(request, reply);
      if (!ctx || (ctx as any).success === false) return;
      const id = parseIdOrFail(reply, request.params, 'Documento não encontrado');
      if (!id) return;
      const body = request.body as any;

      const doc = await prisma.documento.findUnique({ where: { id } }).catch(() => null);
      if (!doc || doc.tenantId !== ctx.tenantId) return fail(reply, 404, 'Documento não encontrado');

      const tituloDocumento = body.tituloDocumento != null ? String(body.tituloDocumento).trim() : null;
      const descricaoDocumento = body.descricaoDocumento != null ? String(body.descricaoDocumento).trim() : null;
      if (tituloDocumento !== null && !tituloDocumento) return fail(reply, 400, 'Título inválido');

      await prisma.documento.update({
        where: { id: doc.id },
        data: {
          tituloDocumento: tituloDocumento ?? undefined,
          name: tituloDocumento ?? undefined,
          descricaoDocumento: descricaoDocumento === null ? null : descricaoDocumento,
          updatedAt: new Date(),
        } as any,
      });

      return ok(reply, { ok: true }, { message: 'Documento atualizado' });
    }
  );

  server.delete('/:id', async (request, reply) => {
    const ctx = await requireTenantUser(request, reply);
    if (!ctx || (ctx as any).success === false) return;
    const id = parseIdOrFail(reply, request.params, 'Documento não encontrado');
    if (!id) return;

    const doc = await prisma.documento.findUnique({ where: { id } }).catch(() => null);
    if (!doc || doc.tenantId !== ctx.tenantId) return fail(reply, 404, 'Documento não encontrado');

    await prisma.documento.update({ where: { id: doc.id }, data: { statusDocumento: 'CANCELADO', updatedAt: new Date() } as any });
    return ok(reply, { ok: true }, { message: 'Documento cancelado' });
  });

  server.get('/:id/download', async (request, reply) => {
    const ctx = await requireTenantUser(request, reply);
    if (!ctx || (ctx as any).success === false) return;
    const id = parseIdOrFail(reply, request.params, 'Documento não encontrado');
    if (!id) return;

    const doc = await prisma.documento.findUnique({ where: { id } }).catch(() => null);
    if (!doc || doc.tenantId !== ctx.tenantId) return fail(reply, 404, 'Documento não encontrado');

    const versaoId = doc.idVersaoAtual != null ? Number(doc.idVersaoAtual) : null;
    if (!versaoId) return fail(reply, 404, 'Documento sem versão');
    return reply.redirect(`/api/v1/documentos/versoes/${versaoId}/download?tipo=ORIGINAL`);
  });

  server.post('/:id/versoes', async (request, reply) => {
    const ctx = await requireTenantUser(request, reply);
    if (!ctx || (ctx as any).success === false) return;
    const id = parseIdOrFail(reply, request.params, 'Documento não encontrado');
    if (!id) return;

    const doc = await prisma.documento.findUnique({ where: { id } }).catch(() => null);
    if (!doc || doc.tenantId !== ctx.tenantId) return fail(reply, 404, 'Documento não encontrado');

    const filePart: any = await (request as any).file?.();
    if (!filePart) return fail(reply, 400, 'Arquivo obrigatório');

    const buffer = await toBufferFromMultipart(filePart);
    if (!buffer.length) return fail(reply, 400, 'Arquivo vazio');
    if (buffer.length > 10 * 1024 * 1024) return fail(reply, 413, 'Arquivo excede 10MB');

    const nome = String(filePart.filename || 'arquivo');
    const mimeType = String(filePart.mimetype || 'application/octet-stream');
    const hash = sha256Hex(buffer);
    const token = crypto.randomBytes(18).toString('base64url');

    const last = await prisma.documentoVersao.findFirst({
      where: { tenantId: ctx.tenantId, documentoId: doc.id },
      orderBy: [{ numeroVersao: 'desc' }, { id: 'desc' }],
      select: { numeroVersao: true },
    });
    const numeroVersao = Number(last?.numeroVersao || 0) + 1;

    const baseUrl = baseApiUrlFromEnvOrRequest(request);
    const created = await prisma.documentoVersao.create({
      data: {
        tenantId: ctx.tenantId,
        documentoId: doc.id,
        numeroVersao,
        urlOriginal: baseUrl ? `${baseUrl}/api/v1/documentos/versoes/0/download?tipo=ORIGINAL` : 'about:blank',
        nomeArquivoOriginal: nome,
        mimeType,
        tamanhoBytes: buffer.length,
        conteudoOriginal: buffer,
        hashSha256Original: hash,
        statusVersao: 'ATIVA',
        verificacaoToken: token,
        updatedAt: new Date(),
      } as any,
      select: { id: true },
    });

    const urlOriginal = baseUrl ? `${baseUrl}/api/v1/documentos/versoes/${created.id}/download?tipo=ORIGINAL` : `/api/v1/documentos/versoes/${created.id}/download?tipo=ORIGINAL`;
    await prisma.$transaction([
      prisma.documentoVersao.update({ where: { id: created.id }, data: { urlOriginal, updatedAt: new Date() } as any }),
      prisma.documento.update(
        {
          where: { id: doc.id },
          data: {
            idVersaoAtual: created.id,
            url: baseUrl ? `${baseUrl}/api/v1/documentos/versoes/${created.id}/download?tipo=ORIGINAL` : `/api/v1/documentos/versoes/${created.id}/download?tipo=ORIGINAL`,
            updatedAt: new Date(),
          } as any,
        } as any
      ),
    ]);

    return ok(reply, { id: created.id, token }, { message: 'Versão criada' });
  });

  server.get('/versoes/:id', async (request, reply) => {
    const ctx = await requireTenantUser(request, reply);
    if (!ctx || (ctx as any).success === false) return;
    const id = parseIdOrFail(reply, request.params, 'Versão não encontrada');
    if (!id) return;

    const v = await prisma.documentoVersao.findUnique({ where: { id }, include: { documento: true } }).catch(() => null);
    if (!v || v.tenantId !== ctx.tenantId || v.documento.tenantId !== ctx.tenantId) return fail(reply, 404, 'Versão não encontrada');

    const verificacaoToken = v.verificacaoToken ? String(v.verificacaoToken) : null;
    return ok(reply, {
      versao: mapVersaoDTO(v),
      documento: mapDocumentoDTO(v.documento),
      fluxo: Array.isArray((v as any).fluxoJson) ? (v as any).fluxoJson : [],
      assinaturas: Array.isArray((v as any).assinaturasJson) ? (v as any).assinaturasJson : [],
      historico: Array.isArray((v as any).historicoJson) ? (v as any).historicoJson : [],
      verificacaoToken,
    });
  });

  server.put(
    '/versoes/:id/fluxo',
    {
      schema: {
        body: z.object({
          itens: z
            .array(
              z.object({
                ordemAssinatura: z.number().int(),
                papelSignatario: z.string(),
                tipoSignatario: z.enum(['USUARIO', 'PERMISSAO']),
                idUsuarioSignatario: z.number().int().nullable(),
                permissaoSignatario: z.string().nullable(),
                assinaturaObrigatoria: z.boolean(),
                parecerObrigatorio: z.boolean(),
                vencimentoEm: z.string().optional().nullable(),
              })
            )
            .default([]),
        }),
      },
    },
    async (request, reply) => {
      const ctx = await requireTenantUser(request, reply);
      if (!ctx || (ctx as any).success === false) return;
      const id = parseIdOrFail(reply, request.params, 'Versão não encontrada');
      if (!id) return;
      const body = request.body as any;

      const v = await prisma.documentoVersao.findUnique({ where: { id } }).catch(() => null);
      if (!v || v.tenantId !== ctx.tenantId) return fail(reply, 404, 'Versão não encontrada');

      await prisma.documentoVersao.update({ where: { id }, data: { fluxoJson: body.itens, updatedAt: new Date() } as any });
      return ok(reply, { ok: true });
    }
  );

  server.post(
    '/versoes/:id/acoes',
    {
      schema: {
        body: z.object({
          acao: z.string().min(2),
          parecer: z.string().optional().nullable(),
          assinatura: z
            .object({
              tipo: z.string().min(2),
              pin: z.string().optional(),
            })
            .optional(),
        }),
      },
    },
    async (request, reply) => {
      const ctx = await requireTenantUser(request, reply);
      if (!ctx || (ctx as any).success === false) return;
      const id = parseIdOrFail(reply, request.params, 'Versão não encontrada');
      if (!id) return;
      const body = request.body as any;

      const v = await prisma.documentoVersao.findUnique({ where: { id } }).catch(() => null);
      if (!v || v.tenantId !== ctx.tenantId) return fail(reply, 404, 'Versão não encontrada');

      const acao = String(body.acao || '').toUpperCase();
      if (acao === 'GERAR_PDF_FINAL') {
        const blob = (v as any).conteudoPdfCarimbado || (v as any).conteudoOriginal;
        if (!blob) return fail(reply, 404, 'Arquivo indisponível');
        const buf = Buffer.from(blob as any);
        const hash = sha256Hex(buf);
        await prisma.documentoVersao.update({
          where: { id },
          data: {
            conteudoPdfCarimbado: buf,
            hashSha256PdfCarimbado: hash,
            finalizadaEm: new Date(),
            updatedAt: new Date(),
          } as any,
        });
        return ok(reply, { ok: true });
      }

      const nowIso = new Date().toISOString();
      const assinaturas = Array.isArray((v as any).assinaturasJson) ? ((v as any).assinaturasJson as any[]) : [];
      const codigo = crypto.randomBytes(10).toString('base64url');
      assinaturas.push({
        id: Date.now(),
        tipoDecisao: acao,
        nomeExibicaoSignatario: String(ctx.email || `user#${ctx.userId}`),
        papelSignatario: 'USUARIO',
        parecer: body.parecer != null ? String(body.parecer) : null,
        codigoVerificacao: codigo,
        criadoEm: nowIso,
      });

      await prisma.documentoVersao.update({ where: { id }, data: { assinaturasJson: assinaturas, updatedAt: new Date() } as any });
      return ok(reply, { ok: true });
    }
  );

  async function buildVerificacaoDTO(versao: any, documento: any) {
    const blob = (versao as any).conteudoPdfCarimbado || (versao as any).conteudoOriginal;
    const buf = blob ? Buffer.from(blob as any) : null;
    const hashConferido = buf ? sha256Hex(buf) : null;
    const hashEsperado = (versao as any).conteudoPdfCarimbado ? (versao.hashSha256PdfCarimbado || null) : (versao.hashSha256Original || null);
    const assinaturas = Array.isArray((versao as any).assinaturasJson) ? ((versao as any).assinaturasJson as any[]) : [];
    return {
      valido: Boolean(hashConferido && hashEsperado && hashConferido === hashEsperado),
      tituloDocumento: String(documento.tituloDocumento || documento.name || ''),
      numeroVersao: Number(versao.numeroVersao || 1),
      hashConferido,
      hashEsperado,
      assinado: Boolean(assinaturas.length),
      signatarios: assinaturas.map((a) => ({
        nome: String(a.nomeExibicaoSignatario || ''),
        papel: String(a.papelSignatario || ''),
        dataHora: String(a.criadoEm || ''),
        decisao: String(a.tipoDecisao || ''),
        codigo: String(a.codigoVerificacao || ''),
      })),
    };
  }

  server.get('/versoes/:id/verificar', async (request, reply) => {
    const ctx = await requireTenantUser(request, reply);
    if (!ctx || (ctx as any).success === false) return;
    const id = parseIdOrFail(reply, request.params, 'Versão não encontrada');
    if (!id) return;
    const v = await prisma.documentoVersao.findUnique({ where: { id }, include: { documento: true } }).catch(() => null);
    if (!v || v.tenantId !== ctx.tenantId || v.documento.tenantId !== ctx.tenantId) return fail(reply, 404, 'Versão não encontrada');
    return ok(reply, await buildVerificacaoDTO(v, v.documento));
  });

  server.get('/verificacao/:token', async (request, reply) => {
    const { token } = z.object({ token: z.string().min(6) }).parse(request.params || {});
    const v = await prisma.documentoVersao.findFirst({ where: { verificacaoToken: token }, include: { documento: true }, orderBy: { id: 'desc' } }).catch(() => null);
    if (!v) return fail(reply, 404, 'Token inválido');
    return ok(reply, await buildVerificacaoDTO(v, v.documento));
  });

  server.get('/versoes/:id/download', async (request, reply) => {
    const ctx = await requireTenantUser(request, reply);
    if (!ctx || (ctx as any).success === false) return;
    const id = parseIdOrFail(reply, request.params, 'Versão não encontrada');
    if (!id) return;
    const q = z.object({ tipo: z.string().optional() }).parse((request.query as any) || {});
    const tipo = String(q.tipo || 'ORIGINAL').toUpperCase();

    const v = await prisma.documentoVersao.findUnique({ where: { id }, include: { documento: true } }).catch(() => null);
    if (!v || v.tenantId !== ctx.tenantId || v.documento.tenantId !== ctx.tenantId) return fail(reply, 404, 'Versão não encontrada');

    const blob = tipo === 'PDF_FINAL' ? (v as any).conteudoPdfCarimbado : (v as any).conteudoOriginal;
    if (!blob) return fail(reply, 404, 'Arquivo indisponível');
    const buf = Buffer.from(blob as any);
    const mime = tipo === 'PDF_FINAL' ? 'application/pdf' : String(v.mimeType || 'application/octet-stream');
    const name = String(v.nomeArquivoOriginal || `documento-${v.documentoId}-v${v.numeroVersao}`);
    const filename = tipo === 'PDF_FINAL' && !name.toLowerCase().endsWith('.pdf') ? `${name}.pdf` : name;

    reply.header('Content-Type', mime);
    reply.header('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
    return reply.send(buf);
  });
}
