import type { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { replyError } from '@/shared/errors/HttpError.js'
import { authenticate } from '@/shared/middleware/authenticate.js'
import { createObraDto } from '@/modules/obras/application/dtos/createObraDto.js'
import { updateObraDto } from '@/modules/obras/application/dtos/updateObraDto.js'
import { makeObraUseCases } from '@/modules/obras/application/factories/makeObraUseCases.js'
import type { AbrangenciaContext } from '@/modules/obras/domain/entities/Obra.js'
import { lookupCep, normalizeCep, resolveCoords, searchGeocode } from '@/modules/obras/infrastructure/services/GeocodingService.js'

type UserCtx = { tenantId: number; abrangencia?: AbrangenciaContext }
function ctx(request: FastifyRequest): UserCtx {
  return request.user as UserCtx
}

type EnderecoBody = {
  nomeEndereco?: string | null
  principal?: boolean
  origem: 'LINK' | 'CEP' | 'MANUAL'
  link?: string
  cep?: string
  logradouro?: string | null
  numero?: string | null
  complemento?: string | null
  bairro?: string | null
  cidade?: string | null
  uf?: string | null
  latitude?: string | null
  longitude?: string | null
  origemEndereco?: 'LINK' | 'CEP' | 'MANUAL'
  origemCoordenada?: 'LINK' | 'CEP' | 'MANUAL'
}

async function buildEnderecoInput(b: EnderecoBody) {
  const origem = String(b.origem || 'MANUAL').toUpperCase() as 'LINK' | 'CEP' | 'MANUAL'
  if (origem === 'CEP') {
    const base = await lookupCep(String(b.cep || ''))
    if (!base) throw new Error('CEP inválido')
    return { ...base, numero: b.numero ?? null, nomeEndereco: b.nomeEndereco ?? null, principal: b.principal ?? null, origemEndereco: 'CEP' as const, origemCoordenada: 'CEP' as const }
  }
  if (origem === 'LINK') {
    const { coords, addr } = await resolveCoords({ link: String(b.link || '') })
    if (!coords) throw new Error('Não foi possível extrair latitude/longitude do link')
    return { ...(addr || {}), ...coords, nomeEndereco: b.nomeEndereco ?? null, principal: b.principal ?? null, origemEndereco: (addr ? 'LINK' : 'MANUAL') as 'LINK' | 'MANUAL', origemCoordenada: 'LINK' as const }
  }
  return {
    nomeEndereco: b.nomeEndereco ?? null, principal: b.principal ?? null,
    cep: b.cep ? normalizeCep(b.cep) || null : null,
    logradouro: b.logradouro ?? null, numero: b.numero ?? null, complemento: b.complemento ?? null,
    bairro: b.bairro ?? null, cidade: b.cidade ?? null, uf: b.uf ?? null,
    latitude: b.latitude ?? null, longitude: b.longitude ?? null,
    origemEndereco: 'MANUAL' as const, origemCoordenada: 'MANUAL' as const,
  }
}

const enderecoBodySchema = z.object({
  nomeEndereco: z.string().optional().nullable(),
  principal: z.boolean().optional(),
  origem: z.enum(['LINK', 'CEP', 'MANUAL']),
  link: z.string().optional(),
  cep: z.string().optional(),
  logradouro: z.string().optional().nullable(),
  numero: z.string().optional().nullable(),
  complemento: z.string().optional().nullable(),
  bairro: z.string().optional().nullable(),
  cidade: z.string().optional().nullable(),
  uf: z.string().optional().nullable(),
  latitude: z.string().optional().nullable(),
  longitude: z.string().optional().nullable(),
  origemEndereco: z.enum(['LINK', 'CEP', 'MANUAL']).optional(),
  origemCoordenada: z.enum(['LINK', 'CEP', 'MANUAL']).optional(),
}).passthrough()

export default async function obrasRoutes(server: FastifyInstance) {
  const { create, update, delete: del, getById, list, repo } = makeObraUseCases()

  server.addHook('onRequest', authenticate)
  server.addHook('preHandler', async (request, reply) => {
    if (typeof ctx(request).tenantId !== 'number') return reply.code(403).send({ message: 'Tenant não selecionado' })
  })

  // ── Geocoding preview ─────────────────────────────────────────────────────

  server.post('/enderecos/preview/link', { schema: { body: z.object({ link: z.string().min(8) }) } }, async (request, reply) => {
    const { link } = request.body as { link: string }
    try {
      const { coords, addr } = await resolveCoords({ link })
      if (!coords) return reply.code(400).send({ message: 'Não foi possível extrair latitude/longitude do link' })
      return reply.send({ ...coords, logradouro: addr?.logradouro ?? null, numero: addr?.numero ?? null, complemento: null, bairro: addr?.bairro ?? null, cidade: addr?.cidade ?? null, uf: addr?.uf ?? null, cep: addr?.cep ?? null, origemEndereco: addr ? 'LINK' : 'MANUAL', origemCoordenada: 'LINK' })
    } catch (e) { return replyError(reply, e) }
  })

  server.post('/enderecos/preview/cep', { schema: { body: z.object({ cep: z.string().min(8) }) } }, async (request, reply) => {
    const { cep } = request.body as { cep: string }
    try {
      const base = await lookupCep(cep)
      if (!base) return reply.code(400).send({ message: 'CEP inválido' })
      const q = [base.logradouro, base.bairro, base.cidade, base.uf, base.cep].filter(Boolean).join(', ')
      const coords = await searchGeocode(q)
      return reply.send({ ...base, latitude: coords?.latitude ?? null, longitude: coords?.longitude ?? null, origemEndereco: 'CEP', origemCoordenada: coords ? 'CEP' : 'MANUAL' })
    } catch (e) { return replyError(reply, e) }
  })

  server.post('/enderecos/preview/buscar-cep', {
    schema: { body: z.object({ logradouro: z.string().optional().nullable(), numero: z.string().optional().nullable(), bairro: z.string().optional().nullable(), cidade: z.string().optional().nullable(), uf: z.string().optional().nullable() }) },
  }, async (request, reply) => {
    const b = request.body as Record<string, string | null>
    const q = [b.logradouro, b.numero, b.bairro, b.cidade, b.uf].filter(Boolean).join(', ')
    if (!q) return reply.code(400).send({ message: 'Informe rua, cidade e UF para buscar o CEP' })
    try {
      const res = await searchGeocode(q)
      if (!res?.cep) return reply.code(400).send({ message: 'Não foi possível localizar o CEP para este endereço' })
      return reply.send({ cep: res.cep })
    } catch (e) { return replyError(reply, e) }
  })

  // ── CRUD obras ────────────────────────────────────────────────────────────

  server.post('/', { schema: { body: createObraDto } }, async (request, reply) => {
    try {
      const { tenantId } = ctx(request)
      const obra = await create.execute(tenantId, request.body as z.infer<typeof createObraDto>)
      return reply.code(201).send(obra)
    } catch (e) { return replyError(reply, e) }
  })

  server.get('/', async (request, reply) => {
    const { tenantId, abrangencia } = ctx(request)
    const q = z.object({ contratoId: z.coerce.number().int().positive().optional() }).parse(request.query || {})
    return reply.send(await list.execute(tenantId, abrangencia, { contratoId: q.contratoId }))
  })

  server.get('/resumo-financeiro', { schema: { querystring: z.object({ contratoId: z.coerce.number().int().positive().optional() }) } }, async (request, reply) => {
    const { tenantId, abrangencia } = ctx(request)
    const q = request.query as { contratoId?: number }
    return reply.send(await repo.findResumoFinanceiro(tenantId, abrangencia, { contratoId: q?.contratoId }))
  })

  server.get('/:id', { schema: { params: z.object({ id: z.coerce.number().int() }) } }, async (request, reply) => {
    try {
      const { tenantId, abrangencia } = ctx(request)
      const { id } = request.params as { id: number }
      return reply.send(await getById.execute(tenantId, id, abrangencia))
    } catch (e) { return replyError(reply, e) }
  })

  server.put('/:id', { schema: { params: z.object({ id: z.coerce.number().int() }), body: updateObraDto } }, async (request, reply) => {
    try {
      const { tenantId, abrangencia } = ctx(request)
      const { id } = request.params as { id: number }
      return reply.send(await update.execute(tenantId, id, request.body as z.infer<typeof updateObraDto>, abrangencia))
    } catch (e) { return replyError(reply, e) }
  })

  server.delete('/:id', { schema: { params: z.object({ id: z.coerce.number().int() }) } }, async (request, reply) => {
    try {
      const { tenantId, abrangencia } = ctx(request)
      const { id } = request.params as { id: number }
      await del.execute(tenantId, id, abrangencia)
      return reply.code(204).send()
    } catch (e) { return replyError(reply, e) }
  })

  // ── Endereços ─────────────────────────────────────────────────────────────

  server.get('/:id/endereco', { schema: { params: z.object({ id: z.coerce.number().int() }) } }, async (request, reply) => {
    try {
      const { tenantId } = ctx(request)
      const { id } = request.params as { id: number }
      return reply.send(await repo.getAddress(tenantId, id))
    } catch (e) { return replyError(reply, e) }
  })

  server.put('/:id/endereco', { schema: { params: z.object({ id: z.coerce.number().int() }), body: enderecoBodySchema } }, async (request, reply) => {
    try {
      const { tenantId } = ctx(request)
      const { id } = request.params as { id: number }
      return reply.send(await repo.upsertAddress(tenantId, id, await buildEnderecoInput(request.body as EnderecoBody)))
    } catch (e) { return replyError(reply, e) }
  })

  server.get('/:id/enderecos', { schema: { params: z.object({ id: z.coerce.number().int().positive() }) } }, async (request, reply) => {
    try {
      const { tenantId } = ctx(request)
      const { id } = request.params as { id: number }
      return reply.send(await repo.listAddresses(tenantId, id))
    } catch (e) { return replyError(reply, e) }
  })

  server.post('/:id/enderecos', { schema: { params: z.object({ id: z.coerce.number().int().positive() }), body: enderecoBodySchema } }, async (request, reply) => {
    try {
      const { tenantId } = ctx(request)
      const { id } = request.params as { id: number }
      return reply.send(await repo.createAddress(tenantId, id, await buildEnderecoInput(request.body as EnderecoBody)))
    } catch (e) { return replyError(reply, e) }
  })

  server.put('/:id/enderecos/:enderecoId', { schema: { params: z.object({ id: z.coerce.number().int().positive(), enderecoId: z.coerce.number().int().positive() }), body: enderecoBodySchema } }, async (request, reply) => {
    try {
      const { tenantId } = ctx(request)
      const { id, enderecoId } = request.params as { id: number; enderecoId: number }
      return reply.send(await repo.updateAddress(tenantId, id, enderecoId, await buildEnderecoInput(request.body as EnderecoBody)))
    } catch (e) { return replyError(reply, e) }
  })

  server.delete('/:id/enderecos/:enderecoId', { schema: { params: z.object({ id: z.coerce.number().int().positive(), enderecoId: z.coerce.number().int().positive() }) } }, async (request, reply) => {
    try {
      const { tenantId } = ctx(request)
      const { id, enderecoId } = request.params as { id: number; enderecoId: number }
      await repo.deleteAddress(tenantId, id, enderecoId)
      return reply.send({ success: true })
    } catch (e) { return replyError(reply, e) }
  })

  // ── Orçamento / custos ────────────────────────────────────────────────────

  server.get('/:id/orcamento', { schema: { params: z.object({ id: z.coerce.number().int() }) } }, async (request, reply) => {
    try {
      const { tenantId } = ctx(request)
      const { id } = request.params as { id: number }
      return reply.send(await repo.getBudget(tenantId, id))
    } catch (e) { return replyError(reply, e) }
  })

  server.put('/:id/orcamento', { schema: { params: z.object({ id: z.coerce.number().int() }), body: z.object({ valorPrevisto: z.number().min(0) }) } }, async (request, reply) => {
    try {
      const { tenantId } = ctx(request)
      const { id } = request.params as { id: number }
      const { valorPrevisto } = request.body as { valorPrevisto: number }
      return reply.send(await repo.updateBudget(tenantId, id, valorPrevisto))
    } catch (e) { return replyError(reply, e) }
  })

  server.get('/:id/custos', { schema: { params: z.object({ id: z.coerce.number().int() }) } }, async (request, reply) => {
    try {
      const { tenantId } = ctx(request)
      const { id } = request.params as { id: number }
      return reply.send((await repo.getBudget(tenantId, id)).custos)
    } catch (e) { return replyError(reply, e) }
  })

  server.post('/:id/custos', { schema: { params: z.object({ id: z.coerce.number().int() }), body: z.object({ description: z.string().min(1), amount: z.number().positive(), date: z.string().optional() }) } }, async (request, reply) => {
    try {
      const { tenantId } = ctx(request)
      const { id } = request.params as { id: number }
      return reply.code(201).send(await repo.addCost(tenantId, id, request.body as { description: string; amount: number; date?: string }))
    } catch (e) { return replyError(reply, e) }
  })

  server.delete('/:id/custos/:custoId', { schema: { params: z.object({ id: z.coerce.number().int(), custoId: z.coerce.number().int() }) } }, async (request, reply) => {
    try {
      const { tenantId } = ctx(request)
      const { id, custoId } = request.params as { id: number; custoId: number }
      return reply.send(await repo.removeCost(tenantId, id, custoId))
    } catch (e) { return replyError(reply, e) }
  })

  // ── Planilha contratada ───────────────────────────────────────────────────

  server.get('/:id/planilha/resumo', { schema: { params: z.object({ id: z.coerce.number().int().positive() }) } }, async (request, reply) => {
    try {
      const { tenantId } = ctx(request)
      const { id } = request.params as { id: number }
      return reply.send(await repo.getSheetSummary(tenantId, id))
    } catch (e) { return replyError(reply, e) }
  })

  server.post('/:id/planilha/minima', { schema: { params: z.object({ id: z.coerce.number().int().positive() }) } }, async (request, reply) => {
    try {
      const { tenantId } = ctx(request)
      const { id } = request.params as { id: number }
      return reply.send(await repo.ensureMinimumSheet(tenantId, id))
    } catch (e) { return replyError(reply, e) }
  })

  server.get('/:id/planilha/itens', { schema: { params: z.object({ id: z.coerce.number().int().positive() }) } }, async (request, reply) => {
    try {
      const { tenantId } = ctx(request)
      const { id } = request.params as { id: number }
      return reply.send(await repo.listSheetItems(tenantId, id))
    } catch (e) { return replyError(reply, e) }
  })

  server.post('/:id/planilha/itens', {
    schema: { params: z.object({ id: z.coerce.number().int().positive() }), body: z.object({ codigoServico: z.string().min(3), descricao: z.string().optional().nullable(), unidade: z.string().optional().nullable(), quantidade: z.number().optional().nullable(), precoUnitario: z.number().optional().nullable() }) },
  }, async (request, reply) => {
    try {
      const { tenantId } = ctx(request)
      const { id } = request.params as { id: number }
      return reply.send(await repo.addSheetItem(tenantId, id, request.body as { codigoServico: string; descricao?: string | null; unidade?: string | null; quantidade?: number | null; precoUnitario?: number | null }))
    } catch (e) { return replyError(reply, e) }
  })
}
