import crypto from 'node:crypto'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { makeDocumentosUseCases } from '@/application/contracts/makeDocumentosUseCases.js'
import type { DocumentoRow, VersaoRow } from '@/domain/repositories/IDocumentosRepository.js'
import { replyError } from '@/shared/errors/HttpError.js'
import { authenticate } from '@/infra/http/middlewares/authenticate.js'

// ── HTTP Infrastructure helpers (not domain logic) ───────────────────────────

function sha256Hex(buf: Buffer): string {
  return crypto.createHash('sha256').update(buf).digest('hex')
}

async function toBufferFromMultipart(filePart: unknown): Promise<Buffer> {
  if (!filePart) return Buffer.from([])
  const part = filePart as Record<string, unknown>
  if (typeof part.toBuffer === 'function') {
    return (part.toBuffer as () => Promise<Buffer>)()
  }
  const stream = (part.file ?? part) as Record<string, unknown>
  if (!stream || typeof stream.on !== 'function') return Buffer.from([])
  const chunks: Buffer[] = []
  await new Promise<void>((resolve, reject) => {
    const s = stream as unknown as NodeJS.EventEmitter
    s.on('data', (c: Buffer | Uint8Array) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)))
    s.on('end', () => resolve())
    s.on('error', (e: unknown) => reject(e))
  })
  return Buffer.concat(chunks)
}

function baseApiUrlFromRequest(request: FastifyRequest): string {
  const env = String(process.env.PUBLIC_API_URL ?? '').trim().replace(/\/$/, '')
  if (env) return env
  const proto = String(
    request.headers['x-forwarded-proto'] ?? request.protocol ?? 'https',
  )
    .split(',')[0]
    .trim() || 'https'
  const host = String(
    request.headers['x-forwarded-host'] ?? request.headers.host ?? '',
  )
    .split(',')[0]
    .trim()
  if (!host) return ''
  return `${proto}://${host}`
}

// ── Response helpers ─────────────────────────────────────────────────────────

type ApiSuccess<T> = { success: true; message?: string; data: T; meta?: unknown }

function ok<T>(reply: FastifyReply, data: T, opts?: { message?: string; meta?: unknown }) {
  const payload: ApiSuccess<T> = { success: true, data }
  if (opts?.message) payload.message = opts.message
  if (opts?.meta) payload.meta = opts.meta
  return reply.send(payload)
}

// ── DTO mappers ──────────────────────────────────────────────────────────────

function mapDocumentoDTO(d: DocumentoRow) {
  const entidadeTipo = d.contratoId ? 'CONTRATO' : d.obraId ? 'OBRA' : null
  const entidadeId = d.contratoId ? Number(d.contratoId) : d.obraId ? Number(d.obraId) : null
  return {
    id: Number(d.id),
    entidadeTipo,
    entidadeId,
    categoriaDocumento: String(d.categoriaDocumento ?? d.type ?? 'OBRA:OUTROS'),
    tituloDocumento: String(d.tituloDocumento ?? d.name ?? ''),
    descricaoDocumento: d.descricaoDocumento != null ? String(d.descricaoDocumento) : null,
    statusDocumento: String(d.statusDocumento ?? 'ATIVO'),
    idVersaoAtual: d.idVersaoAtual != null ? Number(d.idVersaoAtual) : null,
    criadoEm: d.uploadedAt instanceof Date
      ? d.uploadedAt.toISOString()
      : new Date(String(d.uploadedAt ?? new Date().toISOString())).toISOString(),
    atualizadoEm: d.updatedAt instanceof Date
      ? d.updatedAt.toISOString()
      : new Date(String(d.updatedAt ?? d.uploadedAt ?? new Date().toISOString())).toISOString(),
  }
}

function mapVersaoDTO(v: VersaoRow) {
  return {
    id: Number(v.id),
    idDocumentoRegistro: Number(v.documentoId),
    numeroVersao: Number(v.numeroVersao ?? 1),
    nomeArquivoOriginal: String(v.nomeArquivoOriginal ?? ''),
    mimeType: String(v.mimeType ?? 'application/octet-stream'),
    tamanhoBytes: Number(v.tamanhoBytes ?? 0),
    hashSha256Original: String(v.hashSha256Original ?? ''),
    hashSha256PdfCarimbado: v.hashSha256PdfCarimbado != null ? String(v.hashSha256PdfCarimbado) : null,
    statusVersao: String(v.statusVersao ?? 'ATIVA'),
    finalizadaEm: v.finalizadaEm instanceof Date
      ? v.finalizadaEm.toISOString()
      : v.finalizadaEm
        ? new Date(String(v.finalizadaEm)).toISOString()
        : null,
    criadoEm: v.createdAt instanceof Date
      ? v.createdAt.toISOString()
      : new Date(String(v.createdAt ?? new Date().toISOString())).toISOString(),
  }
}

// ── Zod schemas ───────────────────────────────────────────────────────────────

const idParam = z.object({ id: z.coerce.number().int().positive() })

const listQuerySchema = z.object({
  limit: z.coerce.number().int().optional(),
  entidadeTipo: z.string().optional().nullable(),
  entidadeId: z.coerce.number().int().optional().nullable(),
  categoriaPrefix: z.string().optional().nullable(),
  incluirObrasDoContrato: z.coerce.number().int().optional(),
})

const createDocumentoBodySchema = z.object({
  entidadeTipo: z.string().optional().nullable(),
  entidadeId: z.number().int().optional().nullable(),
  categoriaDocumento: z.string().min(2),
  tituloDocumento: z.string().min(1),
  descricaoDocumento: z.string().optional().nullable(),
})

const updateDocumentoBodySchema = z.object({
  tituloDocumento: z.string().min(1).optional(),
  descricaoDocumento: z.string().optional().nullable(),
})

const updateFluxoBodySchema = z.object({
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
      }),
    )
    .default([]),
})

const executarAcaoBodySchema = z.object({
  acao: z.string().min(2),
  parecer: z.string().optional().nullable(),
  assinatura: z
    .object({
      tipo: z.string().min(2),
      pin: z.string().optional(),
    })
    .optional(),
})

// ── Route plugin ─────────────────────────────────────────────────────────────

export default async function documentosRoutes(server: FastifyInstance) {
  const {
    cancelarDocumento,
    createDocumento,
    createVersao,
    executarAcao,
    updateDocumento,
    updateFluxo,
    downloadVersao,
    getDocumentoById,
    getVersaoById,
    listDocumentos,
    verificarByToken,
    verificarVersao,
  } = makeDocumentosUseCases()

  server.addHook('onRequest', authenticate)

  type UserCtx = { tenantId: number; userId: number; role?: string; email?: string }
  function ctx(request: FastifyRequest): UserCtx {
    return request.user as UserCtx
  }

  // ── GET / — list documentos ───────────────────────────────────────────────

  server.get('/', async (request, reply) => {
    try {
      const { tenantId } = ctx(request)
      const q = listQuerySchema.parse((request.query as unknown) ?? {})

      const limit = Math.min(500, Math.max(1, Number(q.limit ?? 200)))
      const entidadeTipo = q.entidadeTipo ? String(q.entidadeTipo).trim().toUpperCase() : null
      const entidadeId = q.entidadeId != null ? Number(q.entidadeId) : null
      const categoriaPrefix = q.categoriaPrefix ? String(q.categoriaPrefix).trim().toUpperCase() : null
      const incluirObrasDoContrato = Number(q.incluirObrasDoContrato ?? 0) === 1

      const rows = await listDocumentos.execute({
        tenantId,
        entidadeTipo,
        entidadeId,
        categoriaPrefix,
        incluirObrasDoContrato,
        limit,
      })

      return ok(reply, rows.map(mapDocumentoDTO))
    } catch (e) {
      return replyError(reply, e)
    }
  })

  // ── POST / — create documento ─────────────────────────────────────────────

  server.post('/', { schema: { body: createDocumentoBodySchema } }, async (request, reply) => {
    try {
      const { tenantId } = ctx(request)
      const body = request.body as z.infer<typeof createDocumentoBodySchema>

      const entidadeTipo = body.entidadeTipo ? String(body.entidadeTipo).trim().toUpperCase() : null
      const entidadeId = body.entidadeId != null ? Number(body.entidadeId) : null

      if (entidadeTipo && entidadeTipo !== 'OBRA' && entidadeTipo !== 'CONTRATO') {
        return reply.code(400).send({ success: false, message: 'Entidade inválida' })
      }
      if (entidadeTipo && !entidadeId) {
        return reply.code(400).send({ success: false, message: 'Entidade inválida' })
      }

      const baseUrl = baseApiUrlFromRequest(request)

      const result = await createDocumento.execute({
        tenantId,
        entidadeTipo,
        entidadeId,
        categoriaDocumento: String(body.categoriaDocumento).trim().toUpperCase(),
        tituloDocumento: String(body.tituloDocumento).trim(),
        descricaoDocumento: body.descricaoDocumento != null ? String(body.descricaoDocumento).trim() : null,
        baseUrl,
      })

      return ok(reply, { id: result.id }, { message: 'Documento criado' })
    } catch (e) {
      return replyError(reply, e)
    }
  })

  // ── GET /:id — get documento with versoes ─────────────────────────────────

  server.get('/:id', { schema: { params: idParam } }, async (request, reply) => {
    try {
      const { tenantId } = ctx(request)
      const { id } = request.params as z.infer<typeof idParam>

      const result = await getDocumentoById.execute(tenantId, id)
      return ok(reply, {
        documento: mapDocumentoDTO(result.documento),
        versoes: result.versoes.map(mapVersaoDTO),
      })
    } catch (e) {
      return replyError(reply, e)
    }
  })

  // ── PUT /:id — update documento ───────────────────────────────────────────

  server.put('/:id', { schema: { params: idParam, body: updateDocumentoBodySchema } }, async (request, reply) => {
    try {
      const { tenantId } = ctx(request)
      const { id } = request.params as z.infer<typeof idParam>
      const body = request.body as z.infer<typeof updateDocumentoBodySchema>

      const tituloDocumento = body.tituloDocumento != null ? String(body.tituloDocumento).trim() : undefined
      if (tituloDocumento !== undefined && !tituloDocumento) {
        return reply.code(400).send({ success: false, message: 'Título inválido' })
      }

      await updateDocumento.execute({
        tenantId,
        id,
        tituloDocumento: tituloDocumento ?? null,
        descricaoDocumento: body.descricaoDocumento !== undefined ? body.descricaoDocumento : undefined,
      })

      return ok(reply, { ok: true }, { message: 'Documento atualizado' })
    } catch (e) {
      return replyError(reply, e)
    }
  })

  // ── DELETE /:id — cancelar documento ─────────────────────────────────────

  server.delete('/:id', { schema: { params: idParam } }, async (request, reply) => {
    try {
      const { tenantId } = ctx(request)
      const { id } = request.params as z.infer<typeof idParam>

      await cancelarDocumento.execute({ tenantId, id })
      return ok(reply, { ok: true }, { message: 'Documento cancelado' })
    } catch (e) {
      return replyError(reply, e)
    }
  })

  // ── GET /:id/download — redirect to current versao download ──────────────

  server.get('/:id/download', { schema: { params: idParam } }, async (request, reply) => {
    try {
      const { tenantId } = ctx(request)
      const { id } = request.params as z.infer<typeof idParam>

      const result = await getDocumentoById.execute(tenantId, id)
      const versaoId = result.documento.idVersaoAtual != null ? Number(result.documento.idVersaoAtual) : null
      if (!versaoId) {
        return reply.code(404).send({ success: false, message: 'Documento sem versão' })
      }
      return reply.redirect(`/api/v1/documentos/versoes/${versaoId}/download?tipo=ORIGINAL`)
    } catch (e) {
      return replyError(reply, e)
    }
  })

  // ── POST /:id/versoes — upload new versao ─────────────────────────────────

  server.post('/:id/versoes', { schema: { params: idParam } }, async (request, reply) => {
    try {
      const { tenantId } = ctx(request)
      const { id } = request.params as z.infer<typeof idParam>

      const filePart: unknown = await (request as unknown as { file?: () => Promise<unknown> }).file?.()
      if (!filePart) {
        return reply.code(400).send({ success: false, message: 'Arquivo obrigatório' })
      }

      const buffer = await toBufferFromMultipart(filePart)
      if (!buffer.length) {
        return reply.code(400).send({ success: false, message: 'Arquivo vazio' })
      }
      if (buffer.length > 10 * 1024 * 1024) {
        return reply.code(413).send({ success: false, message: 'Arquivo excede 10MB' })
      }

      const part = filePart as Record<string, unknown>
      const nome = String(part.filename ?? 'arquivo')
      const mimeType = String(part.mimetype ?? 'application/octet-stream')
      const hash = sha256Hex(buffer)
      const token = crypto.randomBytes(18).toString('base64url')
      const baseUrl = baseApiUrlFromRequest(request)

      const result = await createVersao.execute({
        tenantId,
        documentoId: id,
        nome,
        mimeType,
        buffer,
        hash,
        token,
        baseUrl,
      })

      return ok(reply, { id: result.id, token: result.token }, { message: 'Versão criada' })
    } catch (e) {
      return replyError(reply, e)
    }
  })

  // ── GET /versoes/:id — get versao detail ──────────────────────────────────

  server.get('/versoes/:id', { schema: { params: idParam } }, async (request, reply) => {
    try {
      const { tenantId } = ctx(request)
      const { id } = request.params as z.infer<typeof idParam>

      const v = await getVersaoById.execute(tenantId, id)

      return ok(reply, {
        versao: mapVersaoDTO(v),
        documento: mapDocumentoDTO(v.documento),
        fluxo: Array.isArray(v.fluxoJson) ? v.fluxoJson : [],
        assinaturas: Array.isArray(v.assinaturasJson) ? v.assinaturasJson : [],
        historico: Array.isArray(v.historicoJson) ? v.historicoJson : [],
        verificacaoToken: v.verificacaoToken ? String(v.verificacaoToken) : null,
      })
    } catch (e) {
      return replyError(reply, e)
    }
  })

  // ── PUT /versoes/:id/fluxo — update fluxo ────────────────────────────────

  server.put(
    '/versoes/:id/fluxo',
    { schema: { params: idParam, body: updateFluxoBodySchema } },
    async (request, reply) => {
      try {
        const { tenantId } = ctx(request)
        const { id } = request.params as z.infer<typeof idParam>
        const body = request.body as z.infer<typeof updateFluxoBodySchema>

        await updateFluxo.execute({ tenantId, versaoId: id, itens: body.itens })
        return ok(reply, { ok: true })
      } catch (e) {
        return replyError(reply, e)
      }
    },
  )

  // ── POST /versoes/:id/acoes — execute action on versao ────────────────────

  server.post(
    '/versoes/:id/acoes',
    { schema: { params: idParam, body: executarAcaoBodySchema } },
    async (request, reply) => {
      try {
        const { tenantId, userId, email } = ctx(request)
        const { id } = request.params as z.infer<typeof idParam>
        const body = request.body as z.infer<typeof executarAcaoBodySchema>

        await executarAcao.execute({
          tenantId,
          versaoId: id,
          acao: String(body.acao ?? '').toUpperCase(),
          parecer: body.parecer ?? null,
          assinatura: body.assinatura,
          userEmail: email ?? `user#${userId}`,
          userId,
        })

        return ok(reply, { ok: true })
      } catch (e) {
        return replyError(reply, e)
      }
    },
  )

  // ── GET /versoes/:id/verificar — verify versao integrity ─────────────────

  server.get('/versoes/:id/verificar', { schema: { params: idParam } }, async (request, reply) => {
    try {
      const { tenantId } = ctx(request)
      const { id } = request.params as z.infer<typeof idParam>

      const result = await verificarVersao.execute(tenantId, id)
      return ok(reply, result)
    } catch (e) {
      return replyError(reply, e)
    }
  })

  // ── GET /verificacao/:token — public token verification ───────────────────

  server.get(
    '/verificacao/:token',
    { schema: { params: z.object({ token: z.string().min(6) }) } },
    async (request, reply) => {
      try {
        const { token } = request.params as { token: string }
        const result = await verificarByToken.execute(token)
        return ok(reply, result)
      } catch (e) {
        return replyError(reply, e)
      }
    },
  )

  // ── GET /versoes/:id/download — stream file content ───────────────────────

  server.get(
    '/versoes/:id/download',
    { schema: { params: idParam, querystring: z.object({ tipo: z.string().optional() }) } },
    async (request, reply) => {
      try {
        const { tenantId } = ctx(request)
        const { id } = request.params as z.infer<typeof idParam>
        const q = request.query as { tipo?: string }
        const tipo = String(q.tipo ?? 'ORIGINAL').toUpperCase() as 'ORIGINAL' | 'PDF_FINAL'

        const result = await downloadVersao.execute(tenantId, id, tipo)

        reply.header('Content-Type', result.mimeType)
        reply.header('Content-Disposition', `attachment; filename="${encodeURIComponent(result.filename)}"`)
        return reply.send(result.buffer)
      } catch (e) {
        return replyError(reply, e)
      }
    },
  )
}
