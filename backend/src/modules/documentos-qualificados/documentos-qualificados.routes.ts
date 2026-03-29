import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import crypto from 'crypto';
import prisma from '../../plugins/prisma.js';
import { authenticate } from '../../utils/authenticate.js';
import { getQualifiedSignatureProvider } from './providers/registry.js';
import { encryptSecret, hasSecretsKey } from './crypto.js';

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

async function requireAdminOrEncarregado(request: FastifyRequest, reply: FastifyReply) {
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

  const enc = await prisma.empresaEncarregadoSistema.findFirst({
    where: { tenantId: ctx.tenantId, ativo: true },
    orderBy: { id: 'desc' },
    select: { userId: true },
  });
  if (enc?.userId === ctx.userId) return ctx;
  return fail(reply, 403, 'Acesso negado');
}

function sha256Hex(buf: Buffer) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function mapProviderStatusToLocal(status: string) {
  const s = String(status || '').toUpperCase();
  if (['SIGNED', 'ASSINADA', 'COMPLETED', 'CONCLUIDA', 'DONE'].includes(s)) return 'ASSINADA';
  if (['REJECTED', 'REJEITADA'].includes(s)) return 'REJEITADA';
  if (['CANCELED', 'CANCELADA'].includes(s)) return 'CANCELADA';
  if (['EXPIRED', 'EXPIRADA'].includes(s)) return 'EXPIRADA';
  if (['ERROR', 'ERRO', 'FAILED', 'FALHOU'].includes(s)) return 'ERRO';
  if (['PARTIAL', 'PARCIAL'].includes(s)) return 'PARCIAL';
  if (['SENT', 'ENVIADA'].includes(s)) return 'AGUARDANDO_ASSINATURA';
  if (s) return 'AGUARDANDO_ASSINATURA';
  return 'AGUARDANDO_ASSINATURA';
}

export default async function documentosQualificadosRoutes(server: FastifyInstance) {
  server.addHook('onRequest', authenticate);

  server.get('/provedores', async (request, reply) => {
    const ctx = await requireAdminOrEncarregado(request, reply);
    if (!ctx || (ctx as any).success === false) return;

    const rows = await prisma.documentoAssinaturaProvedor.findMany({
      where: { tenantId: ctx.tenantId, ativo: true },
      orderBy: [{ tipo: 'asc' }, { codigo: 'asc' }],
      select: {
        id: true,
        tenantId: true,
        nome: true,
        codigo: true,
        tipo: true,
        ambiente: true,
        baseUrl: true,
        configuracaoJson: true,
        ativo: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    return ok(
      reply,
      rows.map((r) => ({
        ...r,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
      }))
    );
  });

  server.post(
    '/provedores',
    {
      schema: {
        body: z.object({
          nome: z.string().min(2),
          codigo: z.string().min(2),
          tipo: z.enum(['ICP_QUALIFICADA', 'AVANCADA']),
          ambiente: z.enum(['SANDBOX', 'PRODUCAO']).default('SANDBOX'),
          baseUrl: z.string().min(8),
          clientId: z.string().optional().nullable(),
          clientSecret: z.string().optional().nullable(),
          apiKey: z.string().optional().nullable(),
          configuracaoJson: z.unknown().optional().nullable(),
          ativo: z.boolean().default(true),
        }),
      },
    },
    async (request, reply) => {
      const ctx = await requireAdminOrEncarregado(request, reply);
      if (!ctx || (ctx as any).success === false) return;
      const body = request.body as any;

      let clientSecretEnc: string | null = null;
      let apiKeyEnc: string | null = null;
      try {
        if (body.clientSecret) clientSecretEnc = encryptSecret(String(body.clientSecret));
        if (body.apiKey) apiKeyEnc = encryptSecret(String(body.apiKey));
      } catch (e: any) {
        if (String(e?.message || '').includes('APP_SECRETS_KEY_MISSING') && (body.clientSecret || body.apiKey)) {
          return fail(reply, 501, 'APP_SECRETS_KEY não configurada. Configure para armazenar segredos de provedor.');
        }
        return fail(reply, 500, 'Falha ao criptografar segredos.');
      }

      const created = await prisma.documentoAssinaturaProvedor.create({
        data: {
          tenantId: ctx.tenantId,
          nome: String(body.nome),
          codigo: String(body.codigo).trim().toUpperCase(),
          tipo: String(body.tipo),
          ambiente: String(body.ambiente),
          baseUrl: String(body.baseUrl),
          clientId: body.clientId ? String(body.clientId) : null,
          clientSecretCriptografado: clientSecretEnc,
          apiKeyCriptografada: apiKeyEnc,
          configuracaoJson: body.configuracaoJson ?? null,
          ativo: body.ativo !== false,
        },
      });
      return ok(reply, { id: created.id, hasSecretsKey: hasSecretsKey() }, { message: 'Provedor criado' });
    }
  );

  server.post(
    '/solicitacoes',
    {
      schema: {
        body: z.object({
          documentoId: z.number().int(),
          versaoId: z.number().int().optional().nullable(),
          provedorId: z.number().int(),
          tipoAssinatura: z.enum(['QUALIFICADA_ICP_BRASIL', 'AVANCADA_EXTERNA']),
          exigeTodosSignatarios: z.boolean().default(true),
          signatarios: z
            .array(
              z.object({
                ordemAssinatura: z.number().int().min(1),
                tipoSignatario: z.enum(['USUARIO', 'FUNCIONARIO', 'EXTERNO']),
                userId: z.number().int().optional().nullable(),
                nome: z.string().min(2),
                email: z.string().email(),
                documento: z.string().optional().nullable(),
                papel: z.string().min(2).default('SIGNER'),
                obrigatorio: z.boolean().default(true),
              })
            )
            .min(1),
          expiraEm: z.string().optional().nullable(),
          metadataJson: z.unknown().optional().nullable(),
        }),
      },
    },
    async (request, reply) => {
      const ctx = getAuthContext(request);
      if (!ctx) return fail(reply, 401, 'Não autenticado');
      if (ctx.isSystemAdmin) return fail(reply, 403, 'Tenant não selecionado');

      const body = request.body as any;
      const doc = await prisma.documento.findUnique({ where: { id: body.documentoId } }).catch(() => null);
      if (!doc || doc.tenantId !== ctx.tenantId) return fail(reply, 404, 'Documento não encontrado');

      let versaoId = typeof body.versaoId === 'number' ? body.versaoId : null;
      if (!versaoId) {
        const created = await prisma.documentoVersao.create({
          data: {
            tenantId: ctx.tenantId,
            documentoId: doc.id,
            numeroVersao: 1,
            urlOriginal: doc.url,
          },
        });
        versaoId = created.id;
      } else {
        const v = await prisma.documentoVersao.findUnique({ where: { id: versaoId } }).catch(() => null);
        if (!v || v.tenantId !== ctx.tenantId || v.documentoId !== doc.id) return fail(reply, 404, 'Versão do documento inválida');
      }

      const provedor = await prisma.documentoAssinaturaProvedor.findUnique({ where: { id: body.provedorId } }).catch(() => null);
      if (!provedor || provedor.tenantId !== ctx.tenantId) return fail(reply, 404, 'Provedor não encontrado');

      const expiraEm = body.expiraEm ? new Date(String(body.expiraEm)) : null;
      if (expiraEm && Number.isNaN(expiraEm.getTime())) return fail(reply, 400, 'expiraEm inválido');

      const callbackToken = crypto.randomBytes(24).toString('base64url');

      const created = await prisma.$transaction(async (tx) => {
        const s = await tx.documentoAssinaturaSolicitacao.create({
          data: {
            tenantId: ctx.tenantId,
            documentoId: doc.id,
            versaoId: versaoId!,
            provedorId: provedor.id,
            tipoAssinatura: String(body.tipoAssinatura),
            statusSolicitacao: 'RASCUNHO',
            exigeTodosSignatarios: body.exigeTodosSignatarios !== false,
            callbackToken,
            expiraEm,
            solicitanteUserId: ctx.userId,
            metadataJson: body.metadataJson ?? null,
          },
        });
        await tx.documentoAssinaturaSolicitacaoSignatario.createMany({
          data: body.signatarios.map((p: any) => ({
            tenantId: ctx.tenantId,
            solicitacaoId: s.id,
            ordemAssinatura: p.ordemAssinatura,
            tipoSignatario: p.tipoSignatario,
            userId: typeof p.userId === 'number' ? p.userId : null,
            nomeSignatario: String(p.nome),
            emailSignatario: String(p.email),
            documentoSignatario: p.documento ? String(p.documento) : null,
            papelSignatario: String(p.papel || 'SIGNER'),
            assinaturaObrigatoria: p.obrigatorio !== false,
            statusSignatario: 'PENDENTE',
          })),
        });
        return s;
      });

      return ok(reply, { id: created.id, callbackToken }, { message: 'Solicitação criada' });
    }
  );

  server.get('/solicitacoes', async (request, reply) => {
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
    if (q.status) where.statusSolicitacao = String(q.status).toUpperCase();

    const skip = (q.pagina - 1) * q.limite;
    const [rows, total] = await Promise.all([
      prisma.documentoAssinaturaSolicitacao.findMany({
        where,
        include: { provedor: { select: { codigo: true, tipo: true, ambiente: true } } },
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        skip,
        take: q.limite,
      }),
      prisma.documentoAssinaturaSolicitacao.count({ where }),
    ]);

    return ok(
      reply,
      rows.map((r) => ({
        id: r.id,
        documentoId: r.documentoId,
        versaoId: r.versaoId,
        tipoAssinatura: r.tipoAssinatura,
        statusSolicitacao: r.statusSolicitacao,
        providerEnvelopeId: r.providerEnvelopeId,
        providerStatus: r.providerStatus,
        linkAssinaturaExterno: r.linkAssinaturaExterno,
        enviadoEm: r.enviadoEm ? r.enviadoEm.toISOString() : null,
        concluidoEm: r.concluidoEm ? r.concluidoEm.toISOString() : null,
        expiraEm: r.expiraEm ? r.expiraEm.toISOString() : null,
        provedor: r.provedor,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
      })),
      { meta: { pagina: q.pagina, limite: q.limite, total } }
    );
  });

  server.get('/solicitacoes/:id', async (request, reply) => {
    const ctx = getAuthContext(request);
    if (!ctx) return fail(reply, 401, 'Não autenticado');
    if (ctx.isSystemAdmin) return fail(reply, 403, 'Tenant não selecionado');

    const { id } = z.object({ id: z.coerce.number().int() }).parse(request.params || {});
    const row = await prisma.documentoAssinaturaSolicitacao.findUnique({
      where: { id },
      include: {
        provedor: { select: { id: true, codigo: true, tipo: true, ambiente: true, baseUrl: true } },
        signatarios: true,
        artefatos: { select: { id: true, tipoArtefato: true, nomeArquivo: true, mimeType: true, tamanhoBytes: true, hashSha256: true, createdAt: true } },
        evidencias: true,
      },
    });
    if (!row || row.tenantId !== ctx.tenantId) return fail(reply, 404, 'Solicitação não encontrada');

    return ok(reply, {
      ...row,
      enviadoEm: row.enviadoEm ? row.enviadoEm.toISOString() : null,
      concluidoEm: row.concluidoEm ? row.concluidoEm.toISOString() : null,
      expiraEm: row.expiraEm ? row.expiraEm.toISOString() : null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      signatarios: row.signatarios.map((s) => ({
        ...s,
        assinadoEm: s.assinadoEm ? s.assinadoEm.toISOString() : null,
        createdAt: s.createdAt.toISOString(),
        updatedAt: s.updatedAt.toISOString(),
      })),
      artefatos: row.artefatos.map((a) => ({ ...a, createdAt: a.createdAt.toISOString() })),
      evidencias: row.evidencias.map((e) => ({ ...e, createdAt: e.createdAt.toISOString() })),
    });
  });

  server.post('/solicitacoes/:id/enviar', async (request, reply) => {
    const ctx = getAuthContext(request);
    if (!ctx) return fail(reply, 401, 'Não autenticado');
    if (ctx.isSystemAdmin) return fail(reply, 403, 'Tenant não selecionado');

    const { id } = z.object({ id: z.coerce.number().int() }).parse(request.params || {});
    const s = await prisma.documentoAssinaturaSolicitacao.findUnique({
      where: { id },
      include: { provedor: true, signatarios: true, versao: true },
    });
    if (!s || s.tenantId !== ctx.tenantId) return fail(reply, 404, 'Solicitação não encontrada');
    if (s.statusSolicitacao !== 'RASCUNHO' && s.statusSolicitacao !== 'ERRO') return fail(reply, 409, 'Solicitação não pode ser enviada neste status');
    if (!s.callbackToken) return fail(reply, 400, 'Solicitação sem callbackToken');

    const providerImpl = getQualifiedSignatureProvider(s.provedor.codigo);
    if (!providerImpl) return fail(reply, 501, `Provedor não suportado em código: ${s.provedor.codigo}`);

    const url = s.versao.urlOriginal;
    const fileName = `documento-${s.documentoId}-v${s.versao.numeroVersao}.pdf`;
    const docRes = await fetch(url).catch(() => null);
    if (!docRes || !docRes.ok) return fail(reply, 502, 'Falha ao baixar o documento original');
    const arrayBuf = await docRes.arrayBuffer();
    const buffer = Buffer.from(arrayBuf);

    const baseUrl = String(process.env.PUBLIC_API_URL || '').replace(/\/$/, '');
    const callbackUrl = `${baseUrl}/api/v1/documentos/qualificados/callback/${encodeURIComponent(s.provedor.codigo)}`;
    if (!callbackUrl.startsWith('http')) return fail(reply, 501, 'PUBLIC_API_URL não configurado para receber callback do provedor');

    const created = await providerImpl.createEnvelope({
      tenantId: s.tenantId,
      requestId: s.id,
      callbackUrl,
      callbackToken: s.callbackToken,
      document: { fileName, mimeType: 'application/pdf', buffer },
      signers: s.signatarios.map((p) => ({ name: p.nomeSignatario, email: p.emailSignatario, document: p.documentoSignatario, role: p.papelSignatario })),
      config: (s.provedor.configuracaoJson as any) || null,
    });

    const updated = await prisma.documentoAssinaturaSolicitacao.update({
      where: { id: s.id },
      data: {
        providerEnvelopeId: created.envelopeId,
        providerDocumentId: created.documentId ?? null,
        linkAssinaturaExterno: created.signingUrl ?? null,
        providerStatus: 'ENVIADA',
        statusSolicitacao: 'AGUARDANDO_ASSINATURA',
        enviadoEm: new Date(),
        motivoErro: null,
      },
    });

    return ok(reply, { id: updated.id, envelopeId: created.envelopeId, signingUrl: created.signingUrl ?? null }, { message: 'Solicitação enviada' });
  });

  server.post('/solicitacoes/:id/sincronizar', async (request, reply) => {
    const ctx = getAuthContext(request);
    if (!ctx) return fail(reply, 401, 'Não autenticado');
    if (ctx.isSystemAdmin) return fail(reply, 403, 'Tenant não selecionado');

    const { id } = z.object({ id: z.coerce.number().int() }).parse(request.params || {});
    const s = await prisma.documentoAssinaturaSolicitacao.findUnique({
      where: { id },
      include: { provedor: true, versao: true },
    });
    if (!s || s.tenantId !== ctx.tenantId) return fail(reply, 404, 'Solicitação não encontrada');
    if (!s.providerEnvelopeId) return fail(reply, 400, 'Solicitação sem envelopeId');

    const providerImpl = getQualifiedSignatureProvider(s.provedor.codigo);
    if (!providerImpl) return fail(reply, 501, `Provedor não suportado em código: ${s.provedor.codigo}`);

    const status = await providerImpl.getEnvelopeStatus({ tenantId: s.tenantId, envelopeId: s.providerEnvelopeId, config: (s.provedor.configuracaoJson as any) || null });
    const localStatus = mapProviderStatusToLocal(status.status);

    let concluded = false;
    let signedArtifactId: number | null = null;

    const updated = await prisma.$transaction(async (tx) => {
      const u = await tx.documentoAssinaturaSolicitacao.update({
        where: { id: s.id },
        data: {
          providerStatus: String(status.status || ''),
          statusSolicitacao: localStatus,
          motivoErro: null,
          concluidoEm: localStatus === 'ASSINADA' ? new Date() : s.concluidoEm,
        },
      });

      if (localStatus === 'ASSINADA') {
        const dl = await providerImpl.downloadSignedDocument({ tenantId: s.tenantId, envelopeId: s.providerEnvelopeId!, config: (s.provedor.configuracaoJson as any) || null });
        const hash = sha256Hex(dl.buffer);
        const signedBytes = Uint8Array.from(dl.buffer);
        const art = await tx.documentoAssinaturaArtefato.create({
          data: {
            tenantId: s.tenantId,
            solicitacaoId: s.id,
            tipoArtefato: 'PDF_ASSINADO',
            nomeArquivo: dl.fileName,
            mimeType: dl.mimeType,
            tamanhoBytes: dl.buffer.length,
            hashSha256: hash,
            data: signedBytes,
          },
        });
        signedArtifactId = art.id;

        await tx.documentoVersao.update({
          where: { id: s.versaoId },
          data: {
            urlAssinado: null,
            hashSha256Assinado: hash,
            tipoAssinaturaFinal: s.tipoAssinatura,
            assinaturaQualificadaConcluida: true,
            verificacaoAssinaturaStatus: 'NAO_VERIFICADA',
            verificacaoAssinaturaEm: null,
          },
        });
        concluded = true;
      }

      return u;
    });

    return ok(reply, { id: updated.id, statusSolicitacao: updated.statusSolicitacao, concluded, signedArtifactId }, { message: 'Status sincronizado' });
  });

  server.post('/solicitacoes/:id/cancelar', async (request, reply) => {
    const ctx = getAuthContext(request);
    if (!ctx) return fail(reply, 401, 'Não autenticado');
    if (ctx.isSystemAdmin) return fail(reply, 403, 'Tenant não selecionado');

    const { id } = z.object({ id: z.coerce.number().int() }).parse(request.params || {});
    const s = await prisma.documentoAssinaturaSolicitacao.findUnique({ where: { id } }).catch(() => null);
    if (!s || s.tenantId !== ctx.tenantId) return fail(reply, 404, 'Solicitação não encontrada');

    const updated = await prisma.documentoAssinaturaSolicitacao.update({
      where: { id },
      data: { statusSolicitacao: 'CANCELADA', providerStatus: 'CANCELADA', motivoErro: null },
    });
    return ok(reply, { id: updated.id }, { message: 'Solicitação cancelada' });
  });

  server.get('/solicitacoes/:id/artefatos', async (request, reply) => {
    const ctx = getAuthContext(request);
    if (!ctx) return fail(reply, 401, 'Não autenticado');
    if (ctx.isSystemAdmin) return fail(reply, 403, 'Tenant não selecionado');

    const { id } = z.object({ id: z.coerce.number().int() }).parse(request.params || {});
    const s = await prisma.documentoAssinaturaSolicitacao.findUnique({ where: { id } }).catch(() => null);
    if (!s || s.tenantId !== ctx.tenantId) return fail(reply, 404, 'Solicitação não encontrada');

    const rows = await prisma.documentoAssinaturaArtefato.findMany({
      where: { tenantId: ctx.tenantId, solicitacaoId: id },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: { id: true, tipoArtefato: true, nomeArquivo: true, mimeType: true, tamanhoBytes: true, hashSha256: true, createdAt: true },
    });

    return ok(reply, rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })));
  });

  server.post('/solicitacoes/:id/verificar', async (request, reply) => {
    const ctx = getAuthContext(request);
    if (!ctx) return fail(reply, 401, 'Não autenticado');
    if (ctx.isSystemAdmin) return fail(reply, 403, 'Tenant não selecionado');

    const { id } = z.object({ id: z.coerce.number().int() }).parse(request.params || {});
    const s = await prisma.documentoAssinaturaSolicitacao.findUnique({
      where: { id },
      include: { provedor: true },
    });
    if (!s || s.tenantId !== ctx.tenantId) return fail(reply, 404, 'Solicitação não encontrada');

    const art = await prisma.documentoAssinaturaArtefato.findFirst({
      where: { tenantId: ctx.tenantId, solicitacaoId: id, tipoArtefato: 'PDF_ASSINADO' },
      orderBy: { id: 'desc' },
    });
    if (!art || !art.data) return fail(reply, 404, 'PDF assinado não encontrado');

    const providerImpl = getQualifiedSignatureProvider(s.provedor.codigo);
    let valid: boolean | null = null;
    try {
      if (providerImpl?.verifyDocument) {
        const res = await providerImpl.verifyDocument({ tenantId: ctx.tenantId, buffer: Buffer.from(art.data), config: (s.provedor.configuracaoJson as any) || null });
        valid = Boolean(res.valid);
      }
    } catch {
      valid = null;
    }

    const status = valid === true ? 'VALIDA' : valid === false ? 'INVALIDA' : 'NAO_VERIFICADA';
    await prisma.documentoVersao.update({
      where: { id: s.versaoId },
      data: { verificacaoAssinaturaStatus: status, verificacaoAssinaturaEm: new Date() },
    });
    return ok(reply, { valido: valid, status });
  });

  server.post('/callback/:provider', async (request, reply) => {
    const providerCode = String((request.params as any)?.provider || '').trim().toUpperCase();
    const token = String(request.headers['x-callback-token'] || '');
    const payload = (request.body as any) ?? null;

    const provedor = await prisma.documentoAssinaturaProvedor
      .findFirst({ where: { codigo: providerCode }, orderBy: { id: 'desc' } })
      .catch(() => null);
    if (!provedor) return reply.code(404).send({ ok: false });

    const solicitacao = token
      ? await prisma.documentoAssinaturaSolicitacao.findFirst({
          where: { tenantId: provedor.tenantId, provedorId: provedor.id, callbackToken: token },
          orderBy: { id: 'desc' },
        })
      : null;

    await prisma.documentoAssinaturaCallback.create({
      data: {
        tenantId: provedor.tenantId,
        solicitacaoId: solicitacao?.id ?? null,
        provedorId: provedor.id,
        providerEvento: 'WEBHOOK',
        providerRequestId: String(request.headers['x-request-id'] || '') || null,
        payloadJson: payload ?? {},
        statusProcessamento: 'PENDENTE',
      },
    });

    return reply.send({ ok: true });
  });
}

