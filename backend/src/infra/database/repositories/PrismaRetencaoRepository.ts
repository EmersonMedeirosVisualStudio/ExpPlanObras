import { Prisma } from '@prisma/client'
import prisma from '@/infra/database/prisma/client.js'
import type {
  IRetencaoRepository,
  ListPoliticasFilter,
  CreatePoliticaInput,
  UpdatePoliticaInput,
  ListRetencaoItemsFilter,
  CreateLegalHoldInput,
  ListDescarteLotesFilter,
  ListAuditoriaFilter,
  PagedResult,
} from '@/domain/repositories/IRetencaoRepository.js'

export class PrismaRetencaoRepository implements IRetencaoRepository {
  // ── Politicas ─────────────────────────────────────────────────────────────

  async listPoliticas(tenantId: number, filter: ListPoliticasFilter): Promise<PagedResult<unknown>> {
    const pagina = filter.pagina ?? 1
    const limite = filter.limite ?? 30
    const skip = (pagina - 1) * limite

    const where: Record<string, unknown> = { tenantId }
    if (filter.recurso) where['recurso'] = filter.recurso
    if (filter.ativo === true) where['ativo'] = true
    if (filter.ativo === false) where['ativo'] = false

    const [rows, total] = await Promise.all([
      prisma.governancaRetencaoPolitica.findMany({
        where,
        orderBy: [{ prioridade: 'desc' }, { id: 'desc' }],
        skip,
        take: limite,
      }),
      prisma.governancaRetencaoPolitica.count({ where }),
    ])
    return { rows, total }
  }

  async getPoliticaById(tenantId: number, id: number): Promise<unknown> {
    return prisma.governancaRetencaoPolitica.findUnique({ where: { id } }).then((row) => {
      if (!row || row.tenantId !== tenantId) return null
      return row
    })
  }

  async createPolitica(tenantId: number, input: CreatePoliticaInput): Promise<unknown> {
    return prisma.governancaRetencaoPolitica.create({
      data: {
        tenantId,
        codigoPolitica: input.codigoPolitica,
        nomePolitica: input.nomePolitica,
        recurso: input.recurso,
        categoriaRecurso: input.categoriaRecurso ?? null,
        eventoBase: input.eventoBase,
        periodoValor: input.periodoValor,
        periodoUnidade: input.periodoUnidade,
        acaoFinal: input.acaoFinal,
        exigeAprovacaoDescarte: input.exigeAprovacaoDescarte,
        respeitaBackupTtl: input.respeitaBackupTtl,
        anonimizarCamposJson: (input.anonimizarCamposJson ?? Prisma.JsonNull) as Prisma.InputJsonValue,
        condicaoJson: (input.condicaoJson ?? Prisma.JsonNull) as Prisma.InputJsonValue,
        prioridade: input.prioridade,
        ativo: input.ativo,
        criadoPorUserId: input.criadoPorUserId,
        atualizadoPorUserId: input.atualizadoPorUserId,
      },
    })
  }

  async updatePolitica(tenantId: number, id: number, input: UpdatePoliticaInput): Promise<unknown> {
    return prisma.governancaRetencaoPolitica.update({
      where: { id },
      data: {
        nomePolitica: input.nomePolitica,
        categoriaRecurso: input.categoriaRecurso ?? null,
        eventoBase: input.eventoBase,
        periodoValor: input.periodoValor,
        periodoUnidade: input.periodoUnidade,
        acaoFinal: input.acaoFinal,
        exigeAprovacaoDescarte: input.exigeAprovacaoDescarte,
        respeitaBackupTtl: input.respeitaBackupTtl,
        anonimizarCamposJson: (input.anonimizarCamposJson ?? Prisma.JsonNull) as Prisma.InputJsonValue,
        condicaoJson: (input.condicaoJson ?? Prisma.JsonNull) as Prisma.InputJsonValue,
        prioridade: input.prioridade,
        ativo: input.ativo,
        atualizadoPorUserId: input.atualizadoPorUserId,
      },
    })
  }

  // ── Retencao items ────────────────────────────────────────────────────────

  async listRetencaoItems(tenantId: number, filter: ListRetencaoItemsFilter): Promise<PagedResult<unknown>> {
    const pagina = filter.pagina ?? 1
    const limite = filter.limite ?? 30
    const skip = (pagina - 1) * limite

    const where: Record<string, unknown> = { tenantId }
    if (filter.recurso) where['recurso'] = filter.recurso
    if (filter.status) where['statusRetencao'] = filter.status
    if (filter.holdAtivo === true) where['holdAtivo'] = true
    if (filter.holdAtivo === false) where['holdAtivo'] = false
    if (filter.elegivel === true) where['elegivelDescarteEm'] = { lte: new Date() }
    if (filter.elegivel === false) where['OR'] = [{ elegivelDescarteEm: null }, { elegivelDescarteEm: { gt: new Date() } }]

    const [rows, total] = await Promise.all([
      prisma.governancaRetencaoItem.findMany({
        where,
        orderBy: [{ elegivelDescarteEm: 'asc' }, { id: 'asc' }],
        skip,
        take: limite,
      }),
      prisma.governancaRetencaoItem.count({ where }),
    ])
    return { rows, total }
  }

  // ── Legal holds ───────────────────────────────────────────────────────────

  async listLegalHolds(tenantId: number): Promise<unknown[]> {
    return prisma.governancaLegalHold.findMany({
      where: { tenantId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    })
  }

  async getLegalHoldById(tenantId: number, id: number): Promise<unknown> {
    return prisma.governancaLegalHold.findUnique({ where: { id } }).then((row) => {
      if (!row || row.tenantId !== tenantId) return null
      return row
    })
  }

  async createLegalHold(tenantId: number, input: CreateLegalHoldInput): Promise<unknown> {
    return prisma.governancaLegalHold.create({
      data: {
        tenantId,
        codigoHold: input.codigoHold,
        tituloHold: input.tituloHold,
        motivoHold: input.motivoHold,
        tipoHold: input.tipoHold,
        statusHold: 'ATIVO',
        criteriaJson: (input.criteriaJson ?? Prisma.JsonNull) as Prisma.InputJsonValue,
        criadorUserId: input.criadorUserId,
      },
    })
  }

  // ── Descarte lotes ────────────────────────────────────────────────────────

  async listDescarteLotes(tenantId: number, filter?: ListDescarteLotesFilter): Promise<unknown[]> {
    const take = filter?.limite ?? 100
    return prisma.governancaDescarteLote.findMany({
      where: { tenantId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take,
    })
  }

  async getDescarteLoteById(tenantId: number, id: number): Promise<unknown> {
    return prisma.governancaDescarteLote.findUnique({ where: { id } }).then((row) => {
      if (!row || row.tenantId !== tenantId) return null
      return row
    })
  }

  async getDescarteLoteItens(tenantId: number, loteId: number): Promise<unknown[]> {
    return prisma.governancaDescarteLoteItem.findMany({
      where: { tenantId, loteId },
      orderBy: [{ id: 'asc' }],
      take: 5000,
    })
  }

  // ── Auditoria ─────────────────────────────────────────────────────────────

  async listAuditoria(tenantId: number, filter: ListAuditoriaFilter): Promise<PagedResult<unknown>> {
    const pagina = filter.pagina ?? 1
    const limite = filter.limite ?? 50
    const skip = (pagina - 1) * limite

    const where: Record<string, unknown> = { tenantId }
    if (filter.recurso) where['recurso'] = filter.recurso
    if (filter.tipoEvento) where['tipoEvento'] = filter.tipoEvento

    const [rows, total] = await Promise.all([
      prisma.governancaRetencaoAuditoria.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip,
        take: limite,
      }),
      prisma.governancaRetencaoAuditoria.count({ where }),
    ])
    return { rows, total }
  }

  // ── Auth helper ───────────────────────────────────────────────────────────

  async getTenantUserRole(tenantId: number, userId: number): Promise<string | null> {
    const row = await prisma.tenantUser.findUnique({
      where: { tenantId_userId: { tenantId, userId } },
      select: { role: true },
    })
    return row?.role ?? null
  }
}
