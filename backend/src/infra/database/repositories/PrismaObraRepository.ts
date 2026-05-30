import { withRLS } from '@/infra/database/prisma/client.js'
import type { AbrangenciaContext, EnderecoObra, Obra, OrigemEndereco } from '@/domain/entities/Obra.js'
import { buildScopeWhere } from '@/domain/entities/Obra.js'
import { ContratoNotFoundError, EnderecoNotFoundError, ObraNotFoundError } from '@/domain/errors/ObraErrors.js'
import type { CreateObraInput, EnderecoInput, IObraRepository, ObraWithEnderecos, ResumoFinanceiro, UpdateObraInput } from '@/domain/repositories/IObraRepository.js'

function toNumber(v: unknown): number {
  if (v == null) return 0
  if (typeof v === 'number' && Number.isFinite(v)) return v
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

function attachPrincipalEndereco(obra: Record<string, unknown>): ObraWithEnderecos {
  const enderecos = Array.isArray(obra.enderecosObra) ? obra.enderecosObra : []
  const principal = (enderecos as EnderecoObra[]).find((e) => e.principal) || (enderecos as EnderecoObra[])[0] || null
  return { ...(obra as unknown as Obra), contrato: (obra.contrato as ObraWithEnderecos['contrato']) ?? null, enderecosObra: enderecos as EnderecoObra[], enderecoObra: principal }
}

async function recomputeContratoValor(tx: unknown, tenantId: number, contratoId: number): Promise<void> {
  const t = tx as Record<string, unknown> & { obra: { aggregate: (a: unknown) => Promise<{ _sum: { valorAtual: unknown } }> }; contrato: { updateMany: (a: unknown) => Promise<void> } }
  const agg = await t.obra.aggregate({ where: { tenantId, contratoId }, _sum: { valorAtual: true } })
  const soma = agg?._sum?.valorAtual == null ? 0 : toNumber(agg._sum.valorAtual)
  await t.contrato.updateMany({ where: { tenantId, id: contratoId }, data: { valorTotalAtual: soma } })
}

export class PrismaObraRepository implements IObraRepository {
  async findById(tenantId: number, id: number, _scope?: AbrangenciaContext): Promise<ObraWithEnderecos | null> {
    const obra = await withRLS(tenantId, async (tx) => {
      return (tx as any).obra.findUnique({
        where: { id },
        include: { enderecosObra: true, contrato: { select: { id: true, numeroContrato: true, status: true, objeto: true } } },
      })
    })
    if (!obra) return null
    if ((obra as any).tenantId !== tenantId) return null
    return attachPrincipalEndereco(obra as Record<string, unknown>)
  }

  async findAll(tenantId: number, scope?: AbrangenciaContext, filter?: { contratoId?: number }): Promise<ObraWithEnderecos[]> {
    const rows = await withRLS(tenantId, async (tx) => {
      const contratoId = typeof filter?.contratoId === 'number' && filter.contratoId > 0 ? filter.contratoId : null
      return (tx as any).obra.findMany({
        orderBy: { createdAt: 'desc' },
        where: { ...buildScopeWhere(tenantId, scope), ...(contratoId ? { contratoId } : {}) },
        include: { enderecosObra: true, contrato: { select: { id: true, numeroContrato: true, status: true, objeto: true } } },
      })
    })
    return (rows as Record<string, unknown>[]).map(attachPrincipalEndereco)
  }

  async findResumoFinanceiro(tenantId: number, scope?: AbrangenciaContext, filter?: { contratoId?: number }): Promise<ResumoFinanceiro[]> {
    return withRLS(tenantId, async (tx) => {
      const contratoId = typeof filter?.contratoId === 'number' && filter.contratoId > 0 ? filter.contratoId : null
      const obras = await (tx as any).obra.findMany({
        where: { ...buildScopeWhere(tenantId, scope), ...(contratoId ? { contratoId } : {}) },
        select: { id: true, valorAtual: true },
      })
      const obraIds = (obras as any[]).map((o) => Number(o.id)).filter((id) => id > 0)
      if (!obraIds.length) return []
      const sums = await (tx as any).medicao.groupBy({ by: ['obraId'], where: { obraId: { in: obraIds } }, _sum: { amount: true } })
      const byId = new Map<number, number>()
      for (const r of sums as any[]) byId.set(Number(r.obraId), toNumber(r?._sum?.amount))
      return (obras as any[]).map((o) => ({ obraId: Number(o.id), valorTotal: toNumber(o.valorAtual), valorMedido: byId.get(Number(o.id)) ?? 0 }))
    })
  }

  async create(tenantId: number, input: CreateObraInput): Promise<ObraWithEnderecos> {
    const obra = await withRLS(tenantId, async (tx) => {
      const contrato = await (tx as any).contrato.findFirst({ where: { tenantId, id: input.contratoId }, select: { id: true } }).catch(() => null)
      if (!contrato) throw new ContratoNotFoundError(input.contratoId)
      const created = await (tx as any).obra.create({
        data: { ...input, valorAtual: input.valorPrevisto ?? 0, tenantId },
        include: { enderecosObra: true, contrato: { select: { id: true, numeroContrato: true, status: true, objeto: true } } },
      })
      await recomputeContratoValor(tx, tenantId, Number(created.contratoId))
      return created
    })
    return attachPrincipalEndereco(obra as Record<string, unknown>)
  }

  async update(tenantId: number, id: number, input: UpdateObraInput): Promise<ObraWithEnderecos> {
    const obra = await withRLS(tenantId, async (tx) => {
      const current = await (tx as any).obra.findFirst({ where: { id, tenantId }, select: { id: true, contratoId: true } }).catch(() => null)
      if (!current) throw new ObraNotFoundError(id)
      if (input.contratoId != null) {
        const c = await (tx as any).contrato.findFirst({ where: { tenantId, id: input.contratoId }, select: { id: true } }).catch(() => null)
        if (!c) throw new ContratoNotFoundError(input.contratoId)
      }
      const count = await (tx as any).obra.updateMany({ where: { id, tenantId }, data: input })
      if (count.count === 0) throw new ObraNotFoundError(id)
      const next = input.contratoId != null ? Number(input.contratoId) : Number(current.contratoId)
      const prev = Number(current.contratoId)
      if (next !== prev) {
        await recomputeContratoValor(tx, tenantId, prev)
        await recomputeContratoValor(tx, tenantId, next)
      }
      return (tx as any).obra.findUnique({ where: { id }, include: { enderecosObra: true, contrato: { select: { id: true, numeroContrato: true, status: true, objeto: true } } } })
    })
    return attachPrincipalEndereco(obra as Record<string, unknown>)
  }

  async delete(tenantId: number, id: number): Promise<void> {
    await withRLS(tenantId, async (tx) => {
      const current = await (tx as any).obra.findFirst({ where: { id, tenantId }, select: { id: true, contratoId: true } }).catch(() => null)
      if (!current) throw new ObraNotFoundError(id)
      const count = await (tx as any).obra.deleteMany({ where: { id, tenantId } })
      if (count.count === 0) throw new ObraNotFoundError(id)
      await recomputeContratoValor(tx, tenantId, Number(current.contratoId))
    })
  }

  async getAddress(tenantId: number, obraId: number): Promise<EnderecoObra | null> {
    return withRLS(tenantId, async (tx) => {
      return (tx as any).enderecoObra.findFirst({ where: { tenantId, obraId }, orderBy: [{ principal: 'desc' }, { id: 'asc' }] })
    })
  }

  async listAddresses(tenantId: number, obraId: number): Promise<EnderecoObra[]> {
    return withRLS(tenantId, async (tx) => {
      return (tx as any).enderecoObra.findMany({ where: { tenantId, obraId }, orderBy: [{ principal: 'desc' }, { id: 'asc' }] })
    })
  }

  async upsertAddress(tenantId: number, obraId: number, input: EnderecoInput): Promise<EnderecoObra> {
    return withRLS(tenantId, async (tx) => {
      const obra = await (tx as any).obra.findFirst({ where: { id: obraId, tenantId }, select: { id: true } })
      if (!obra) throw new ObraNotFoundError(obraId)
      const origemEndereco: OrigemEndereco = (String(input.origemEndereco || 'MANUAL').toUpperCase() as OrigemEndereco) || 'MANUAL'
      const origemCoordenada: OrigemEndereco = (String(input.origemCoordenada || 'MANUAL').toUpperCase() as OrigemEndereco) || 'MANUAL'
      const current = await (tx as any).enderecoObra.findFirst({ where: { tenantId, obraId }, orderBy: [{ principal: 'desc' }, { id: 'asc' }] }).catch(() => null)

      const data: Record<string, unknown> = { tenantId, obraId, origemEndereco, origemCoordenada, principal: true }
      const fields: (keyof EnderecoInput)[] = ['cep', 'logradouro', 'numero', 'complemento', 'bairro', 'cidade', 'uf', 'latitude', 'longitude']
      for (const f of fields) {
        if (input[f] !== undefined) data[f] = input[f] ?? null
      }

      let saved: EnderecoObra
      if (current?.id) {
        saved = await (tx as any).enderecoObra.update({ where: { id: current.id }, data })
      } else {
        saved = await (tx as any).enderecoObra.create({ data })
      }
      await (tx as any).enderecoObra.updateMany({ where: { tenantId, obraId, id: { not: (saved as any).id } }, data: { principal: false } })
      return saved
    })
  }

  async createAddress(tenantId: number, obraId: number, input: EnderecoInput): Promise<EnderecoObra> {
    return withRLS(tenantId, async (tx) => {
      const obra = await (tx as any).obra.findFirst({ where: { id: obraId, tenantId }, select: { id: true } })
      if (!obra) throw new ObraNotFoundError(obraId)
      const origemEndereco: OrigemEndereco = (String(input.origemEndereco || 'MANUAL').toUpperCase() as OrigemEndereco) || 'MANUAL'
      const origemCoordenada: OrigemEndereco = (String(input.origemCoordenada || 'MANUAL').toUpperCase() as OrigemEndereco) || 'MANUAL'
      const existingPrincipal = await (tx as any).enderecoObra.findFirst({ where: { tenantId, obraId, principal: true }, select: { id: true } }).catch(() => null)
      const shouldBePrincipal = Boolean(input.principal) || !existingPrincipal
      const created = await (tx as any).enderecoObra.create({
        data: {
          tenantId, obraId, principal: shouldBePrincipal, origemEndereco, origemCoordenada,
          nomeEndereco: input.nomeEndereco ? String(input.nomeEndereco).trim() || 'Principal' : 'Principal',
          cep: input.cep ?? null, logradouro: input.logradouro ?? null, numero: input.numero ?? null,
          complemento: input.complemento ?? null, bairro: input.bairro ?? null, cidade: input.cidade ?? null,
          uf: input.uf ?? null, latitude: input.latitude ?? null, longitude: input.longitude ?? null,
        },
      })
      if (shouldBePrincipal) await (tx as any).enderecoObra.updateMany({ where: { tenantId, obraId, id: { not: (created as any).id } }, data: { principal: false } })
      return created
    })
  }

  async updateAddress(tenantId: number, obraId: number, enderecoId: number, input: EnderecoInput): Promise<EnderecoObra> {
    return withRLS(tenantId, async (tx) => {
      const obra = await (tx as any).obra.findFirst({ where: { id: obraId, tenantId }, select: { id: true } })
      if (!obra) throw new ObraNotFoundError(obraId)
      const current = await (tx as any).enderecoObra.findFirst({ where: { id: enderecoId, tenantId, obraId } }).catch(() => null)
      if (!current) throw new EnderecoNotFoundError()
      const origemEndereco: OrigemEndereco = (String(input.origemEndereco || 'MANUAL').toUpperCase() as OrigemEndereco) || 'MANUAL'
      const origemCoordenada: OrigemEndereco = (String(input.origemCoordenada || 'MANUAL').toUpperCase() as OrigemEndereco) || 'MANUAL'
      const data: Record<string, unknown> = { origemEndereco, origemCoordenada }
      if (input.nomeEndereco !== undefined) data.nomeEndereco = input.nomeEndereco ? String(input.nomeEndereco).trim() || 'Principal' : 'Principal'
      if (input.principal !== undefined) data.principal = Boolean(input.principal)
      const fields: (keyof EnderecoInput)[] = ['cep', 'logradouro', 'numero', 'complemento', 'bairro', 'cidade', 'uf', 'latitude', 'longitude']
      for (const f of fields) { if (input[f] !== undefined) data[f] = input[f] ?? null }
      const saved = await (tx as any).enderecoObra.update({ where: { id: enderecoId }, data })
      if ((saved as any).principal) {
        await (tx as any).enderecoObra.updateMany({ where: { tenantId, obraId, id: { not: enderecoId } }, data: { principal: false } })
      } else {
        const hasPrincipal = await (tx as any).enderecoObra.findFirst({ where: { tenantId, obraId, principal: true }, select: { id: true } }).catch(() => null)
        if (!hasPrincipal) {
          await (tx as any).enderecoObra.update({ where: { id: enderecoId }, data: { principal: true } })
          await (tx as any).enderecoObra.updateMany({ where: { tenantId, obraId, id: { not: enderecoId } }, data: { principal: false } })
        }
      }
      return saved
    })
  }

  async deleteAddress(tenantId: number, obraId: number, enderecoId: number): Promise<void> {
    await withRLS(tenantId, async (tx) => {
      const obra = await (tx as any).obra.findFirst({ where: { id: obraId, tenantId }, select: { id: true } })
      if (!obra) throw new ObraNotFoundError(obraId)
      const current = await (tx as any).enderecoObra.findFirst({ where: { id: enderecoId, tenantId, obraId }, select: { id: true, principal: true } }).catch(() => null)
      if (!current) throw new EnderecoNotFoundError()
      await (tx as any).enderecoObra.delete({ where: { id: enderecoId } })
      if ((current as any).principal) {
        const next = await (tx as any).enderecoObra.findFirst({ where: { tenantId, obraId }, orderBy: { id: 'asc' }, select: { id: true } }).catch(() => null)
        if (next?.id) {
          await (tx as any).enderecoObra.update({ where: { id: next.id }, data: { principal: true } })
          await (tx as any).enderecoObra.updateMany({ where: { tenantId, obraId, id: { not: next.id } }, data: { principal: false } })
        }
      }
    })
  }

  async getBudget(tenantId: number, obraId: number) {
    return withRLS(tenantId, async (tx) => {
      const obra = await (tx as any).obra.findFirst({ where: { id: obraId, tenantId }, select: { id: true, name: true, valorPrevisto: true, valorAtual: true } })
      if (!obra) throw new ObraNotFoundError(obraId)
      const custos = await (tx as any).custo.findMany({ where: { obraId, tenantId }, orderBy: { date: 'desc' } })
      const totalGasto = (custos as any[]).reduce((sum, c) => sum + toNumber(c.amount), 0)
      return { obra: obra as Obra, totalGasto, saldo: toNumber((obra as any).valorAtual) - totalGasto, custos }
    })
  }

  async updateBudget(tenantId: number, obraId: number, valorPrevisto: number) {
    return withRLS(tenantId, async (tx) => {
      const updated = await (tx as any).obra.updateMany({ where: { id: obraId, tenantId }, data: { valorPrevisto } })
      if (updated.count === 0) throw new ObraNotFoundError(obraId)
      return this.getBudget(tenantId, obraId)
    })
  }

  async addCost(tenantId: number, obraId: number, input: { description: string; amount: number; date?: string }) {
    return withRLS(tenantId, async (tx) => {
      const obra = await (tx as any).obra.findFirst({ where: { id: obraId, tenantId }, select: { id: true } })
      if (!obra) throw new ObraNotFoundError(obraId)
      await (tx as any).custo.create({ data: { obraId, tenantId, description: input.description, amount: input.amount, date: input.date ? new Date(input.date) : new Date() } })
      return this.getBudget(tenantId, obraId)
    })
  }

  async removeCost(tenantId: number, obraId: number, custoId: number) {
    return withRLS(tenantId, async (tx) => {
      const deleted = await (tx as any).custo.deleteMany({ where: { id: custoId, obraId, tenantId } })
      if (deleted.count === 0) throw new Error('Custo not found or access denied')
      return this.getBudget(tenantId, obraId)
    })
  }

  async getSheetSummary(tenantId: number, obraId: number) {
    return withRLS(tenantId, async (tx) => {
      const obra = await (tx as any).obra.findFirst({ where: { id: obraId, tenantId }, select: { id: true } })
      if (!obra) throw new ObraNotFoundError(obraId)
      const planilha = await (tx as any).obraPlanilhaContratada.findFirst({ where: { tenantId, obraId } }).catch(() => null)
      if (!planilha) return { existe: false, itens: 0, temServicoMinimo: false }
      const itens = await (tx as any).obraPlanilhaContratadaItem.count({ where: { tenantId, planilhaId: planilha.id } })
      const temServicoMinimo = await (tx as any).obraPlanilhaContratadaItem
        .findFirst({ where: { tenantId, planilhaId: planilha.id, codigoServico: 'SER-0001' }, select: { id: true } })
        .then((r: unknown) => !!r).catch(() => false)
      return { existe: true, itens, temServicoMinimo }
    })
  }

  async ensureMinimumSheet(tenantId: number, obraId: number): Promise<{ planilhaId: number; codigoServicoMinimo: string }> {
    return withRLS(tenantId, async (tx) => {
      const obra = await (tx as any).obra.findFirst({ where: { id: obraId, tenantId }, select: { id: true, contratoId: true } })
      if (!obra) throw new ObraNotFoundError(obraId)
      const planilha = await (tx as any).obraPlanilhaContratada.upsert({
        where: { tenantId_obraId: { tenantId, obraId } },
        create: { tenantId, obraId, contratoId: (obra as any).contratoId, nome: 'Planilha contratada' },
        update: { contratoId: (obra as any).contratoId },
      })
      const has = await (tx as any).obraPlanilhaContratadaItem.findFirst({ where: { tenantId, planilhaId: (planilha as any).id, codigoServico: 'SER-0001' }, select: { id: true } }).catch(() => null)
      if (!has) {
        await (tx as any).obraPlanilhaContratadaItem.create({ data: { tenantId, planilhaId: (planilha as any).id, codigoServico: 'SER-0001', descricao: 'Serviço mínimo (base)', unidade: 'UN', quantidade: 0, precoUnitario: 0 } })
      }
      return { planilhaId: (planilha as any).id, codigoServicoMinimo: 'SER-0001' }
    })
  }

  async listSheetItems(tenantId: number, obraId: number): Promise<unknown[]> {
    return withRLS(tenantId, async (tx) => {
      const planilha = await (tx as any).obraPlanilhaContratada.findFirst({ where: { tenantId, obraId } }).catch(() => null)
      if (!planilha) return []
      return (tx as any).obraPlanilhaContratadaItem.findMany({ where: { tenantId, planilhaId: (planilha as any).id }, orderBy: [{ codigoServico: 'asc' }, { id: 'asc' }] })
    })
  }

  async addSheetItem(tenantId: number, obraId: number, input: { codigoServico: string; descricao?: string | null; unidade?: string | null; quantidade?: number | null; precoUnitario?: number | null }): Promise<{ planilhaId: number }> {
    return withRLS(tenantId, async (tx) => {
      const obra = await (tx as any).obra.findFirst({ where: { id: obraId, tenantId }, select: { id: true, contratoId: true } })
      if (!obra) throw new ObraNotFoundError(obraId)
      const planilha = await (tx as any).obraPlanilhaContratada.upsert({
        where: { tenantId_obraId: { tenantId, obraId } },
        create: { tenantId, obraId, contratoId: (obra as any).contratoId, nome: 'Planilha contratada' },
        update: { contratoId: (obra as any).contratoId },
      })
      await (tx as any).obraPlanilhaContratadaItem.create({ data: { tenantId, planilhaId: (planilha as any).id, codigoServico: String(input.codigoServico).trim().toUpperCase(), descricao: input.descricao ?? null, unidade: input.unidade ?? null, quantidade: input.quantidade ?? null, precoUnitario: input.precoUnitario ?? null } })
      return { planilhaId: (planilha as any).id }
    })
  }
}
