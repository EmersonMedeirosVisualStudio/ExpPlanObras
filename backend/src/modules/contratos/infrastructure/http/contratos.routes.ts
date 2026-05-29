import type { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { replyError } from '@/shared/errors/HttpError.js'
import { authenticate } from '@/shared/middleware/authenticate.js'
import { makeContratoUseCases } from '@/modules/contratos/application/factories/makeContratoUseCases.js'
import { createContratoDto } from '@/modules/contratos/application/dtos/createContratoDto.js'
import { updateContratoDto } from '@/modules/contratos/application/dtos/updateContratoDto.js'
import { subscribe } from '@/modules/contratos/contratos.realtime.js'

type UserCtx = { tenantId: number }
function ctx(request: FastifyRequest): UserCtx {
  return request.user as UserCtx
}

const idParam = z.object({ id: z.coerce.number().int().positive() })

export default async function contratosRoutes(server: FastifyInstance) {
  const { create, update, getById, repo } = makeContratoUseCases()

  server.addHook('onRequest', authenticate)
  server.addHook('preHandler', async (request, reply) => {
    if (typeof ctx(request).tenantId !== 'number') return reply.code(403).send({ message: 'Tenant não selecionado' })
  })

  // ── SSE Realtime ─────────────────────────────────────────────────────────

  server.get('/realtime/stream', {
    schema: {
      querystring: z.object({
        topics: z.string().optional(),
        contratoId: z.coerce.number().int().positive().optional(),
        token: z.string().optional(),
      }),
    },
  }, async (request, reply) => {
    const q = request.query as { topics?: string; contratoId?: number; token?: string }
    const topicList = String(q.topics || '').split(',').map((t) => t.trim()).filter(Boolean)
    if (q.contratoId) topicList.push(`contrato:${Number(q.contratoId)}`)
    if (!topicList.length) topicList.push('contratos')

    reply.raw.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
    reply.raw.setHeader('Cache-Control', 'no-cache, no-transform')
    reply.raw.setHeader('Connection', 'keep-alive')
    reply.raw.flushHeaders?.()

    const send = (data: unknown) => reply.raw.write(`data: ${JSON.stringify(data)}\n\n`)
    send({ topic: 'system', event: 'connected', payload: { ok: true, topics: topicList } })

    const unsubs = topicList.map((t) => subscribe(t, (msg) => send(msg)))
    const interval = setInterval(() => send({ topic: 'system', event: 'heartbeat', payload: { ts: Date.now() } }), 20000)

    request.raw.on('close', () => { clearInterval(interval); for (const u of unsubs) u() })
    return reply
  })

  // ── Core CRUD ────────────────────────────────────────────────────────────

  server.get('/', { schema: { querystring: z.object({ apenasPrincipais: z.coerce.boolean().optional(), papel: z.string().optional() }) } }, async (request, reply) => {
    const { tenantId } = ctx(request)
    const q = request.query as { apenasPrincipais?: boolean; papel?: string }
    return reply.send(await repo.list(tenantId, { apenasPrincipais: Boolean(q.apenasPrincipais), papel: q.papel }))
  })

  server.get('/dashboard', { schema: { querystring: z.object({ status: z.string().optional(), papel: z.string().optional(), tipoContratante: z.string().optional() }) } }, async (request, reply) => {
    const { tenantId } = ctx(request)
    const q = request.query as { status?: string; papel?: string; tipoContratante?: string }
    return reply.send(await repo.getDashboard(tenantId, q))
  })

  server.get('/faturamento', {
    schema: {
      querystring: z.object({
        start: z.string().min(7),
        end: z.string().min(7),
        contratoId: z.coerce.number().int().positive().optional(),
        empresa: z.string().optional(),
      }),
    },
  }, async (request, reply) => {
    const { tenantId } = ctx(request)
    const q = request.query as { start: string; end: string; contratoId?: number; empresa?: string }
    try {
      return reply.send(await repo.getFaturamento(tenantId, { start: q.start, end: q.end, contratoId: q.contratoId ?? null, empresa: q.empresa ?? null }))
    } catch (e) { return replyError(reply, e) }
  })

  server.get('/:id', { schema: { params: idParam } }, async (request, reply) => {
    try {
      const { id } = request.params as { id: number }
      return reply.send(await getById.execute(ctx(request).tenantId, id))
    } catch (e) { return replyError(reply, e) }
  })

  server.get('/:id/consolidado', { schema: { params: idParam } }, async (request, reply) => {
    try {
      const { id } = request.params as { id: number }
      return reply.send(await repo.getConsolidado(ctx(request).tenantId, id))
    } catch (e) { return replyError(reply, e) }
  })

  server.post('/', { schema: { body: createContratoDto } }, async (request, reply) => {
    try {
      return reply.send(await create.execute(ctx(request).tenantId, request.body as z.infer<typeof createContratoDto>))
    } catch (e) { return replyError(reply, e) }
  })

  server.put('/:id', { schema: { params: idParam, body: updateContratoDto } }, async (request, reply) => {
    try {
      const { id } = request.params as { id: number }
      return reply.send(await update.execute(ctx(request).tenantId, id, request.body as z.infer<typeof updateContratoDto>))
    } catch (e) { return replyError(reply, e) }
  })

  // ── Subcontratos ─────────────────────────────────────────────────────────

  server.get('/:id/subcontratos/resumo', { schema: { params: idParam } }, async (request, reply) => {
    try { return reply.send(await repo.getSubcontratosResumo(ctx(request).tenantId, (request.params as { id: number }).id)) } catch (e) { return replyError(reply, e) }
  })

  server.get('/:id/subcontratos', { schema: { params: idParam } }, async (request, reply) => {
    try { return reply.send(await repo.listSubcontratos(ctx(request).tenantId, (request.params as { id: number }).id)) } catch (e) { return replyError(reply, e) }
  })

  server.post('/:id/subcontratos', {
    schema: { params: idParam, body: z.object({ numeroContrato: z.string().optional().nullable(), subcontratadaNome: z.string().min(2), subcontratadaDocumento: z.string().optional().nullable(), objeto: z.string().min(2), valorTotal: z.number().positive(), dataInicio: z.string().min(10), dataFim: z.string().min(10), status: z.string().optional().nullable() }) },
  }, async (request, reply) => {
    try { return reply.send(await repo.createSubcontrato(ctx(request).tenantId, (request.params as { id: number }).id, request.body)) } catch (e) { return replyError(reply, e) }
  })

  server.put('/:id/subcontratos/:subId', {
    schema: { params: z.object({ id: z.coerce.number().int().positive(), subId: z.coerce.number().int().positive() }), body: z.object({ subcontratadaNome: z.string().optional().nullable(), subcontratadaDocumento: z.string().optional().nullable(), objeto: z.string().optional().nullable(), valorTotal: z.number().optional().nullable(), dataInicio: z.string().optional().nullable(), dataFim: z.string().optional().nullable(), status: z.string().optional().nullable() }) },
  }, async (request, reply) => {
    try {
      const { id, subId } = request.params as { id: number; subId: number }
      return reply.send(await repo.updateSubcontrato(ctx(request).tenantId, id, subId, request.body))
    } catch (e) { return replyError(reply, e) }
  })

  server.delete('/:id/subcontratos/:subId', { schema: { params: z.object({ id: z.coerce.number().int().positive(), subId: z.coerce.number().int().positive() }) } }, async (request, reply) => {
    try {
      const { id, subId } = request.params as { id: number; subId: number }
      return reply.send(await repo.deleteSubcontrato(ctx(request).tenantId, id, subId))
    } catch (e) { return replyError(reply, e) }
  })

  // ── Medições ──────────────────────────────────────────────────────────────

  server.get('/:id/medicoes', { schema: { params: idParam } }, async (request, reply) => {
    try { return reply.send(await repo.listMedicoes(ctx(request).tenantId, (request.params as { id: number }).id)) } catch (e) { return replyError(reply, e) }
  })

  server.post('/:id/medicoes', { schema: { params: idParam, body: z.object({ date: z.string().min(10), amount: z.number().positive(), status: z.string().optional().nullable() }) } }, async (request, reply) => {
    try { return reply.send(await repo.createMedicao(ctx(request).tenantId, (request.params as { id: number }).id, request.body as { date: string; amount: number; status?: string | null })) } catch (e) { return replyError(reply, e) }
  })

  server.put('/:id/medicoes/:medicaoId', { schema: { params: z.object({ id: z.coerce.number().int().positive(), medicaoId: z.coerce.number().int().positive() }), body: z.object({ status: z.string().min(1) }) } }, async (request, reply) => {
    try {
      const { id, medicaoId } = request.params as { id: number; medicaoId: number }
      return reply.send(await repo.updateMedicaoStatus(ctx(request).tenantId, id, medicaoId, request.body as { status: string }))
    } catch (e) { return replyError(reply, e) }
  })

  // ── Pagamentos ────────────────────────────────────────────────────────────

  server.get('/:id/pagamentos', { schema: { params: idParam } }, async (request, reply) => {
    try { return reply.send(await repo.listPagamentos(ctx(request).tenantId, (request.params as { id: number }).id)) } catch (e) { return replyError(reply, e) }
  })

  server.post('/:id/pagamentos', { schema: { params: idParam, body: z.object({ date: z.string().min(10), amount: z.number().positive(), medicaoId: z.number().int().positive().optional().nullable() }) } }, async (request, reply) => {
    try { return reply.send(await repo.createPagamento(ctx(request).tenantId, (request.params as { id: number }).id, request.body as { date: string; amount: number; medicaoId?: number | null })) } catch (e) { return replyError(reply, e) }
  })

  server.delete('/:id/pagamentos/:pagamentoId', { schema: { params: z.object({ id: z.coerce.number().int().positive(), pagamentoId: z.coerce.number().int().positive() }) } }, async (request, reply) => {
    try {
      const { id, pagamentoId } = request.params as { id: number; pagamentoId: number }
      return reply.send(await repo.deletePagamento(ctx(request).tenantId, id, pagamentoId))
    } catch (e) { return replyError(reply, e) }
  })

  // ── Programação financeira ────────────────────────────────────────────────

  server.get('/:id/programacao-financeira', { schema: { params: idParam } }, async (request, reply) => {
    try { return reply.send(await repo.listProgramacaoFinanceira(ctx(request).tenantId, (request.params as { id: number }).id)) } catch (e) { return replyError(reply, e) }
  })

  server.post('/:id/programacao-financeira', { schema: { params: idParam, body: z.object({ competencia: z.string().min(10), valorPrevisto: z.number().positive() }) } }, async (request, reply) => {
    try { return reply.send(await repo.createProgramacaoFinanceira(ctx(request).tenantId, (request.params as { id: number }).id, request.body as { competencia: string; valorPrevisto: number })) } catch (e) { return replyError(reply, e) }
  })

  server.put('/:id/programacao-financeira/:itemId', { schema: { params: z.object({ id: z.coerce.number().int().positive(), itemId: z.coerce.number().int().positive() }), body: z.object({ competencia: z.string().min(10), valorPrevisto: z.number().positive() }) } }, async (request, reply) => {
    try {
      const { id, itemId } = request.params as { id: number; itemId: number }
      return reply.send(await repo.updateProgramacaoFinanceira(ctx(request).tenantId, id, itemId, request.body as { competencia: string; valorPrevisto: number }))
    } catch (e) { return replyError(reply, e) }
  })

  server.delete('/:id/programacao-financeira/:itemId', { schema: { params: z.object({ id: z.coerce.number().int().positive(), itemId: z.coerce.number().int().positive() }) } }, async (request, reply) => {
    try {
      const { id, itemId } = request.params as { id: number; itemId: number }
      return reply.send(await repo.deleteProgramacaoFinanceira(ctx(request).tenantId, id, itemId))
    } catch (e) { return replyError(reply, e) }
  })

  // ── Aditivos ─────────────────────────────────────────────────────────────

  server.get('/:id/aditivos', { schema: { params: idParam } }, async (request, reply) => {
    try { return reply.send(await repo.listAditivos(ctx(request).tenantId, (request.params as { id: number }).id)) } catch (e) { return replyError(reply, e) }
  })

  server.post('/:id/aditivos', {
    schema: { params: idParam, body: z.object({ numeroAditivo: z.string().min(1), tipo: z.enum(['PRAZO', 'VALOR', 'REPROGRAMACAO', 'AMBOS']), dataAssinatura: z.string().min(10), dataInicioVigencia: z.string().min(10).optional().nullable(), dataFimVigencia: z.string().min(10).optional().nullable(), alterouPlanilha: z.coerce.boolean(), justificativa: z.string().optional().nullable(), descricao: z.string().optional().nullable(), prazoAdicionadoDias: z.number().int().optional().nullable(), valorTotalAdicionado: z.number().optional().nullable() }) },
  }, async (request, reply) => {
    try { return reply.send(await repo.createAditivo(ctx(request).tenantId, (request.params as { id: number }).id, request.body)) } catch (e) { return replyError(reply, e) }
  })

  server.put('/:id/aditivos/:aditivoId', {
    schema: { params: z.object({ id: z.coerce.number().int().positive(), aditivoId: z.coerce.number().int().positive() }), body: z.object({ tipo: z.enum(['PRAZO', 'VALOR', 'REPROGRAMACAO', 'AMBOS']).optional(), dataAssinatura: z.string().min(10).optional().nullable(), dataInicioVigencia: z.string().min(10).optional().nullable(), dataFimVigencia: z.string().min(10).optional().nullable(), alterouPlanilha: z.coerce.boolean().optional(), justificativa: z.string().optional().nullable(), descricao: z.string().optional().nullable(), prazoAdicionadoDias: z.number().int().optional().nullable(), valorTotalAdicionado: z.number().optional().nullable() }) },
  }, async (request, reply) => {
    try {
      const { id, aditivoId } = request.params as { id: number; aditivoId: number }
      return reply.send(await repo.updateAditivo(ctx(request).tenantId, id, aditivoId, request.body))
    } catch (e) { return replyError(reply, e) }
  })

  server.post('/:id/aditivos/:aditivoId/aprovar', { schema: { params: z.object({ id: z.coerce.number().int().positive(), aditivoId: z.coerce.number().int().positive() }) } }, async (request, reply) => {
    try {
      const { id, aditivoId } = request.params as { id: number; aditivoId: number }
      return reply.send(await repo.aprovarAditivo(ctx(request).tenantId, id, aditivoId))
    } catch (e) { return replyError(reply, e) }
  })

  server.post('/:id/aditivos/:aditivoId/cancelar', { schema: { params: z.object({ id: z.coerce.number().int().positive(), aditivoId: z.coerce.number().int().positive() }) } }, async (request, reply) => {
    try {
      const { id, aditivoId } = request.params as { id: number; aditivoId: number }
      return reply.send(await repo.cancelarAditivo(ctx(request).tenantId, id, aditivoId))
    } catch (e) { return replyError(reply, e) }
  })

  // ── Serviços e cronograma ─────────────────────────────────────────────────

  server.get('/:id/servicos', { schema: { params: idParam } }, async (request, reply) => {
    try { return reply.send(await repo.listServicos(ctx(request).tenantId, (request.params as { id: number }).id)) } catch (e) { return replyError(reply, e) }
  })

  server.post('/:id/servicos', { schema: { params: idParam, body: z.object({ codigo: z.string().min(1), nome: z.string().min(1), unidade: z.string().optional().nullable(), quantidade: z.number().optional().nullable(), valorUnitario: z.number().optional().nullable(), percentualPeso: z.number().optional().nullable() }) } }, async (request, reply) => {
    try { return reply.send(await repo.createServico(ctx(request).tenantId, (request.params as { id: number }).id, request.body)) } catch (e) { return replyError(reply, e) }
  })

  server.get('/:id/cronograma', { schema: { params: idParam } }, async (request, reply) => {
    try { return reply.send(await repo.getCronograma(ctx(request).tenantId, (request.params as { id: number }).id)) } catch (e) { return replyError(reply, e) }
  })

  server.post('/:id/cronograma/seed', { schema: { params: idParam, body: z.object({ duracaoDiasPadrao: z.number().optional().nullable() }).optional() } }, async (request, reply) => {
    try { return reply.send(await repo.seedCronograma(ctx(request).tenantId, (request.params as { id: number }).id, request.body as { duracaoDiasPadrao?: number | null } | undefined)) } catch (e) { return replyError(reply, e) }
  })

  server.put('/:id/cronograma/:itemId', { schema: { params: z.object({ id: z.coerce.number().int().positive(), itemId: z.coerce.number().int().positive() }), body: z.object({ dataInicio: z.string().min(1), dataFim: z.string().min(1) }) } }, async (request, reply) => {
    try {
      const { id, itemId } = request.params as { id: number; itemId: number }
      return reply.send(await repo.updateCronogramaItem(ctx(request).tenantId, id, itemId, request.body as { dataInicio: string; dataFim: string }))
    } catch (e) { return replyError(reply, e) }
  })

  server.post('/:id/cronograma/dependencias', { schema: { params: idParam, body: z.object({ origemItemId: z.coerce.number().int().positive(), destinoItemId: z.coerce.number().int().positive(), tipo: z.string().optional().nullable() }) } }, async (request, reply) => {
    try { return reply.send(await repo.createCronogramaDependencia(ctx(request).tenantId, (request.params as { id: number }).id, request.body as { origemItemId: number; destinoItemId: number; tipo?: string | null })) } catch (e) { return replyError(reply, e) }
  })

  server.delete('/:id/cronograma/dependencias/:depId', { schema: { params: z.object({ id: z.coerce.number().int().positive(), depId: z.coerce.number().int().positive() }) } }, async (request, reply) => {
    try {
      const { id, depId } = request.params as { id: number; depId: number }
      return reply.send(await repo.deleteCronogramaDependencia(ctx(request).tenantId, id, depId))
    } catch (e) { return replyError(reply, e) }
  })

  // ── Eventos e observações ─────────────────────────────────────────────────

  server.get('/:id/eventos', {
    schema: {
      params: idParam,
      querystring: z.object({ origens: z.string().optional(), incluirObservacoes: z.coerce.boolean().optional(), limit: z.coerce.number().int().positive().optional(), texto: z.string().optional(), desde: z.string().optional(), ate: z.string().optional() }).optional(),
    },
  }, async (request, reply) => {
    const { tenantId } = ctx(request)
    const { id } = request.params as { id: number }
    const q = (request.query as Record<string, string | undefined>) || {}
    const tiposOrigem = String(q.origens || '').split(',').map((s) => s.trim()).filter(Boolean)
    try {
      return reply.send(await repo.listEventos(tenantId, id, {
        tiposOrigem,
        incluirObservacoes: q.incluirObservacoes !== undefined ? Boolean(q.incluirObservacoes) : true,
        limit: q.limit != null ? Number(q.limit) : 100,
        texto: q.texto ?? undefined,
        desde: q.desde ?? undefined,
        ate: q.ate ?? undefined,
      }))
    } catch (e) { return replyError(reply, e) }
  })

  server.post('/:id/observacoes', {
    schema: { params: idParam, body: z.object({ texto: z.string().min(1), nivel: z.enum(['NORMAL', 'ALERTA', 'CRITICO']).optional().nullable(), tipoOrigem: z.enum(['CONTRATO', 'ADITIVO', 'OBRA', 'DOCUMENTO']).optional().nullable(), origemId: z.coerce.number().int().optional().nullable() }) },
  }, async (request, reply) => {
    const { tenantId } = ctx(request)
    const { id } = request.params as { id: number }
    const userId = (request.user as Record<string, unknown>)?.userId as number | undefined
    try { return reply.send(await repo.createObservacao(tenantId, id, { ...(request.body as object), actorUserId: userId ?? null })) } catch (e) { return replyError(reply, e) }
  })

  server.post('/:id/eventos/:eventoId/anexos', {
    schema: { params: z.object({ id: z.coerce.number().int().positive(), eventoId: z.coerce.number().int().positive() }), body: z.object({ nomeArquivo: z.string().min(1), mimeType: z.string().min(1), conteudoBase64: z.string().min(1) }) },
  }, async (request, reply) => {
    const { tenantId } = ctx(request)
    const { id, eventoId } = request.params as { id: number; eventoId: number }
    const userId = (request.user as Record<string, unknown>)?.userId as number | undefined
    try { return reply.send(await repo.addEventoAnexo(tenantId, id, eventoId, { ...(request.body as object), actorUserId: userId ?? null })) } catch (e) { return replyError(reply, e) }
  })

  server.get('/:id/eventos/:eventoId/anexos/:anexoId', { schema: { params: z.object({ id: z.coerce.number().int().positive(), eventoId: z.coerce.number().int().positive(), anexoId: z.coerce.number().int().positive() }) } }, async (request, reply) => {
    const { tenantId } = ctx(request)
    const { id, eventoId, anexoId } = request.params as { id: number; eventoId: number; anexoId: number }
    try {
      const file = await repo.downloadEventoAnexo(tenantId, id, eventoId, anexoId) as { mimeType: string; tamanhoBytes: number; nomeArquivo: string; conteudo: unknown }
      reply.header('Content-Type', file.mimeType)
      reply.header('Content-Length', String(file.tamanhoBytes))
      reply.header('Content-Disposition', `inline; filename="${encodeURIComponent(file.nomeArquivo)}"`)
      return reply.send(file.conteudo)
    } catch (e) { return replyError(reply, e) }
  })
}
