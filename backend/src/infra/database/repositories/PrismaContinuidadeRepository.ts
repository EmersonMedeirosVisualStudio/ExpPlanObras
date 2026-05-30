import prisma from '@/infra/database/prisma/client.js'
import type {
  IContinuidadeRepository,
  ListBcpPlanosFilter,
  CreateBcpPlanoInput,
  ListDrExecucoesFilter,
  CreateDrExecucaoInput,
  ApproveDrExecucaoInput,
  ConcludeDrExecucaoInput,
  ListCrisesFilter,
  CreateCriseRegistroInput,
  PaginatedResult,
} from '@/domain/repositories/IContinuidadeRepository.js'

export class PrismaContinuidadeRepository implements IContinuidadeRepository {
  // ── BcpPlano ──────────────────────────────────────────────────────────────

  async listBcpPlanos(tenantId: number, filter?: ListBcpPlanosFilter): Promise<PaginatedResult<unknown>> {
    const pagina = filter?.pagina ?? 1
    const limite = filter?.limite ?? 30
    const skip = (pagina - 1) * limite

    const where: Record<string, unknown> = { tenantId }
    if (filter?.tipo) where['tipoPlano'] = filter.tipo
    if (filter?.ativo !== undefined) where['ativo'] = filter.ativo

    const [rows, total] = await Promise.all([
      prisma.bcpPlano.findMany({
        where,
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        skip,
        take: limite,
      }),
      prisma.bcpPlano.count({ where }),
    ])

    return { rows, total }
  }

  async getBcpPlanoById(tenantId: number, id: number): Promise<unknown | null> {
    const plano = await prisma.bcpPlano.findUnique({ where: { id } }).catch(() => null)
    if (!plano || plano.tenantId !== tenantId) return null
    return plano
  }

  async createBcpPlano(tenantId: number, input: CreateBcpPlanoInput): Promise<unknown> {
    return prisma.bcpPlano.create({
      data: {
        tenantId,
        codigo: input.codigo,
        nome: input.nome,
        descricao: input.descricao ?? null,
        tipoPlano: input.tipoPlano,
        modulo: input.modulo ?? null,
        criticidade: input.criticidade,
        rtoMinutos: input.rtoMinutos,
        rpoMinutos: input.rpoMinutos,
        ownerUserId: input.ownerUserId,
      } as never,
    })
  }

  // ── DrExecucaoRecuperacao ─────────────────────────────────────────────────

  async listDrExecucoes(tenantId: number, filter?: ListDrExecucoesFilter): Promise<PaginatedResult<unknown>> {
    const pagina = filter?.pagina ?? 1
    const limite = filter?.limite ?? 30
    const skip = (pagina - 1) * limite

    const where: Record<string, unknown> = { tenantId }
    if (filter?.status) where['statusExecucao'] = filter.status

    const [rows, total] = await Promise.all([
      prisma.drExecucaoRecuperacao.findMany({
        where,
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        skip,
        take: limite,
      }),
      prisma.drExecucaoRecuperacao.count({ where }),
    ])

    return { rows, total }
  }

  async getDrExecucaoById(tenantId: number, id: number): Promise<unknown | null> {
    const ex = await prisma.drExecucaoRecuperacao.findUnique({ where: { id } }).catch(() => null)
    if (!ex || ex.tenantId !== tenantId) return null
    return ex
  }

  async createDrExecucao(tenantId: number, input: CreateDrExecucaoInput): Promise<unknown> {
    return prisma.drExecucaoRecuperacao.create({
      data: {
        tenantId,
        planoId: input.planoId,
        origemTipo: input.origemTipo,
        referenciaOrigem: input.referenciaOrigem ?? null,
        tipoRecuperacao: input.tipoRecuperacao,
        statusExecucao: input.statusExecucao,
        aprovacaoExigida: input.aprovacaoExigida,
        iniciadoEm: input.iniciadoEm ?? null,
      } as never,
    })
  }

  async approveDrExecucao(tenantId: number, id: number, input: ApproveDrExecucaoInput): Promise<void> {
    await prisma.drExecucaoRecuperacao.update({
      where: { id },
      data: {
        statusExecucao: 'EXECUTANDO',
        aprovadoPor: input.aprovadoPor,
        iniciadoEm: new Date(),
      } as never,
    })
  }

  async concludeDrExecucao(tenantId: number, id: number, input: ConcludeDrExecucaoInput): Promise<void> {
    const status = input.sucesso ? 'CONCLUIDO' : 'FALHA'
    await prisma.drExecucaoRecuperacao.update({
      where: { id },
      data: {
        statusExecucao: status,
        finalizadoEm: new Date(),
        rtoRealMinutos: input.rtoRealMinutos ?? null,
        rpoRealMinutos: input.rpoRealMinutos ?? null,
        resultadoResumoJson: input.resultadoResumoJson ?? null,
      } as never,
    })
  }

  // ── CriseRegistro ─────────────────────────────────────────────────────────

  async listCrises(tenantId: number, filter?: ListCrisesFilter): Promise<PaginatedResult<unknown>> {
    const pagina = filter?.pagina ?? 1
    const limite = filter?.limite ?? 30
    const skip = (pagina - 1) * limite

    const where: Record<string, unknown> = { tenantId }
    if (filter?.status) where['statusCrise'] = filter.status

    const [rows, total] = await Promise.all([
      prisma.criseRegistro.findMany({
        where,
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        skip,
        take: limite,
      }),
      prisma.criseRegistro.count({ where }),
    ])

    return { rows, total }
  }

  async createCriseRegistro(tenantId: number, input: CreateCriseRegistroInput): Promise<unknown> {
    return prisma.criseRegistro.create({
      data: {
        tenantId,
        codigo: input.codigo,
        titulo: input.titulo,
        descricao: input.descricao ?? null,
        tipoCrise: input.tipoCrise,
        severidade: input.severidade,
        statusCrise: 'ABERTA',
        incidenteOrigemId: input.incidenteOrigemId ?? null,
        planoAcionadoId: input.planoAcionadoId ?? null,
        comandanteUserId: input.comandanteUserId,
        abertaEm: new Date(),
      } as never,
    })
  }

  // ── Readiness helpers ─────────────────────────────────────────────────────

  async countBcpPlanoAtivosCriticos(tenantId: number, planoId: number): Promise<number> {
    return prisma.bcpPlanoAtivoCritico.count({ where: { tenantId, planoId } })
  }

  async countBcpPlanoRunbooks(tenantId: number, planoId: number): Promise<number> {
    return prisma.bcpPlanoRunbook.count({ where: { tenantId, planoId } })
  }

  async findLastBcpTeste(tenantId: number, planoId: number): Promise<unknown | null> {
    return prisma.bcpTeste.findFirst({
      where: { tenantId, planoId, statusTeste: 'CONCLUIDO' },
      orderBy: { executadoEm: 'desc' },
    })
  }

  async countDrExecucoesConcluidas(tenantId: number, planoId: number): Promise<number> {
    return prisma.drExecucaoRecuperacao.count({
      where: { tenantId, planoId, statusExecucao: 'CONCLUIDO' },
    })
  }
}
