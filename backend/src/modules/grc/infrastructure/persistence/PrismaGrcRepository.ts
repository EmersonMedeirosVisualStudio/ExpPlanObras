import prisma from '@/shared/plugins/prisma.js'
import type {
  IGrcRepository,
  GrcRiscoWhere,
  GrcControleWhere,
  GrcAuditoriaWhere,
  GrcAchadoWhere,
  GrcPlanoAcaoWhere,
  GrcEvidenciaWhere,
  PaginationOptions,
  CreateRiscoInput,
  UpdateRiscoInput,
  CreateRiscoAvaliacaoInput,
  AddAvaliacaoTransactionInput,
  CreateControleInput,
  CreateControleTesteInput,
  CreateRiscoControleInput,
  RiscoControleRow,
  ControleTesteRow,
  CreateAuditoriaInput,
  UpdateAuditoriaInput,
  CreateAchadoInput,
  UpdateAchadoInput,
  CreatePlanoAcaoInput,
  UpdatePlanoAcaoInput,
  CreateEvidenciaInput,
} from '@/modules/grc/domain/ports/IGrcRepository.js'

export class PrismaGrcRepository implements IGrcRepository {
  // ── grcRisco ──────────────────────────────────────────────────────────────
  async findManyRiscos(where: GrcRiscoWhere, pagination: PaginationOptions) {
    return prisma.grcRisco.findMany({
      where: where as never,
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      skip: pagination.skip,
      take: pagination.take,
    })
  }

  async countRiscos(where: GrcRiscoWhere) {
    return prisma.grcRisco.count({ where: where as never })
  }

  async createRisco(input: CreateRiscoInput) {
    return prisma.grcRisco.create({ data: input as never })
  }

  async findUniqueRisco(id: number) {
    return prisma.grcRisco.findUnique({ where: { id } }) as Promise<
      | (CreateRiscoInput & {
          id: number
          scoreInerente: number
          impactoInerente: string
          probabilidadeInerente: string
          impactoResidual: string | null
          probabilidadeResidual: string | null
          scoreResidual: number | null
        })
      | null
    >
  }

  async updateRisco(id: number, data: UpdateRiscoInput) {
    await prisma.grcRisco.update({ where: { id }, data: data as never })
  }

  // ── grcRiscoAvaliacao ──────────────────────────────────────────────────────
  async findManyRiscoAvaliacoes(tenantId: number, riscoId: number) {
    return prisma.grcRiscoAvaliacao.findMany({
      where: { tenantId, riscoId },
      orderBy: [{ avaliadoEm: 'desc' }, { id: 'desc' }],
    })
  }

  async createRiscoAvaliacao(input: CreateRiscoAvaliacaoInput) {
    await prisma.grcRiscoAvaliacao.create({ data: input as never })
  }

  // ── addAvaliacaoTransaction ───────────────────────────────────────────────
  async addAvaliacaoTransaction(input: AddAvaliacaoTransactionInput) {
    await prisma.$transaction(async (tx) => {
      await tx.grcRiscoAvaliacao.create({ data: input.avaliacao as never })
      if (input.aplicarComoResidual) {
        await tx.grcRisco.update({
          where: { id: input.riscoId },
          data: {
            impactoResidual: input.impacto,
            probabilidadeResidual: input.probabilidade,
            scoreResidual: input.score,
          } as never,
        })
      }
    })
  }

  // ── grcControleTeste ──────────────────────────────────────────────────────
  async findFirstControleTeste(tenantId: number, controleId: number): Promise<ControleTesteRow | null> {
    return prisma.grcControleTeste.findFirst({
      where: { tenantId, controleId },
      orderBy: [{ executadoEm: 'desc' }, { id: 'desc' }],
      select: { efetividadeScore: true, resultadoTeste: true },
    }) as Promise<ControleTesteRow | null>
  }

  async createControleTeste(input: CreateControleTesteInput) {
    return prisma.grcControleTeste.create({ data: input as never })
  }

  // ── grcControle ───────────────────────────────────────────────────────────
  async findManyControles(where: GrcControleWhere, pagination: PaginationOptions) {
    return prisma.grcControle.findMany({
      where: where as never,
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      skip: pagination.skip,
      take: pagination.take,
    })
  }

  async countControles(where: GrcControleWhere) {
    return prisma.grcControle.count({ where: where as never })
  }

  async createControle(input: CreateControleInput) {
    return prisma.grcControle.create({ data: input as never })
  }

  async findUniqueControle(id: number): Promise<{ id: number; tenantId: number } | null> {
    return prisma.grcControle.findUnique({
      where: { id },
      select: { id: true, tenantId: true },
    }) as Promise<{ id: number; tenantId: number } | null>
  }

  // ── grcRiscoControle ──────────────────────────────────────────────────────
  async createRiscoControle(input: CreateRiscoControleInput) {
    await prisma.grcRiscoControle.create({ data: input as never })
  }

  async findManyRiscoControles(tenantId: number, riscoId: number): Promise<RiscoControleRow[]> {
    return prisma.grcRiscoControle.findMany({
      where: { tenantId, riscoId },
      select: { controleId: true, pesoMitigacao: true },
    }) as Promise<RiscoControleRow[]>
  }

  // ── grcAuditoria ──────────────────────────────────────────────────────────
  async findManyAuditorias(where: GrcAuditoriaWhere, pagination: PaginationOptions) {
    return prisma.grcAuditoria.findMany({
      where: where as never,
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      skip: pagination.skip,
      take: pagination.take,
    })
  }

  async countAuditorias(where: GrcAuditoriaWhere) {
    return prisma.grcAuditoria.count({ where: where as never })
  }

  async createAuditoria(input: CreateAuditoriaInput) {
    return prisma.grcAuditoria.create({ data: input as never })
  }

  async findUniqueAuditoria(id: number): Promise<{ id: number; tenantId: number } | null> {
    return prisma.grcAuditoria.findUnique({
      where: { id },
      select: { id: true, tenantId: true },
    }) as Promise<{ id: number; tenantId: number } | null>
  }

  async updateAuditoria(id: number, data: UpdateAuditoriaInput) {
    await prisma.grcAuditoria.update({ where: { id }, data: data as never })
  }

  // ── grcAchado ─────────────────────────────────────────────────────────────
  async findManyAchados(where: GrcAchadoWhere, pagination: PaginationOptions) {
    return prisma.grcAchado.findMany({
      where: where as never,
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      skip: pagination.skip,
      take: pagination.take,
    })
  }

  async countAchados(where: GrcAchadoWhere) {
    return prisma.grcAchado.count({ where: where as never })
  }

  async createAchado(input: CreateAchadoInput) {
    return prisma.grcAchado.create({ data: input as never })
  }

  async findUniqueAchado(id: number): Promise<{ id: number; tenantId: number } | null> {
    return prisma.grcAchado.findUnique({
      where: { id },
      select: { id: true, tenantId: true },
    }) as Promise<{ id: number; tenantId: number } | null>
  }

  async updateAchado(id: number, data: UpdateAchadoInput) {
    await prisma.grcAchado.update({ where: { id }, data: data as never })
  }

  // ── grcPlanoAcao ──────────────────────────────────────────────────────────
  async findManyPlanosAcao(where: GrcPlanoAcaoWhere, pagination: PaginationOptions) {
    return prisma.grcPlanoAcao.findMany({
      where: where as never,
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      skip: pagination.skip,
      take: pagination.take,
    })
  }

  async countPlanosAcao(where: GrcPlanoAcaoWhere) {
    return prisma.grcPlanoAcao.count({ where: where as never })
  }

  async createPlanoAcao(input: CreatePlanoAcaoInput) {
    return prisma.grcPlanoAcao.create({ data: input as never })
  }

  async findUniquePlanoAcao(id: number): Promise<{ id: number; tenantId: number } | null> {
    return prisma.grcPlanoAcao.findUnique({
      where: { id },
      select: { id: true, tenantId: true },
    }) as Promise<{ id: number; tenantId: number } | null>
  }

  async updatePlanoAcao(id: number, data: UpdatePlanoAcaoInput) {
    await prisma.grcPlanoAcao.update({ where: { id }, data: data as never })
  }

  // ── grcEvidencia ──────────────────────────────────────────────────────────
  async findManyEvidencias(where: GrcEvidenciaWhere, pagination: PaginationOptions) {
    return prisma.grcEvidencia.findMany({
      where: where as never,
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      skip: pagination.skip,
      take: pagination.take,
    })
  }

  async countEvidencias(where: GrcEvidenciaWhere) {
    return prisma.grcEvidencia.count({ where: where as never })
  }

  async createEvidencia(input: CreateEvidenciaInput) {
    return prisma.grcEvidencia.create({ data: input as never })
  }

  // ── tenantUser ────────────────────────────────────────────────────────────
  async findTenantUser(tenantId: number, userId: number): Promise<{ role: string } | null> {
    return prisma.tenantUser.findUnique({
      where: { tenantId_userId: { tenantId, userId } },
      select: { role: true },
    }) as Promise<{ role: string } | null>
  }
}
