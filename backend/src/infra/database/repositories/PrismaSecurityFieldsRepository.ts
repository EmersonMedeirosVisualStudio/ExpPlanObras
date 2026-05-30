import { Prisma } from '@prisma/client'
import prisma from '@/infra/database/prisma/client.js'
import type {
  CheckTenantUserInput,
  CreatePolicyInput,
  ISecurityFieldsRepository,
  ListAuditLogsFilter,
  ListAuditLogsResult,
  ListPoliciesFilter,
  ListPoliciesResult,
  TenantUserRole,
  UpdatePolicyInput,
} from '@/domain/repositories/ISecurityFieldsRepository.js'

export class PrismaSecurityFieldsRepository implements ISecurityFieldsRepository {
  async listPolicies(tenantId: number, filter: ListPoliciesFilter): Promise<ListPoliciesResult> {
    const where: Record<string, unknown> = { tenantId }
    if (filter.recurso) where.recurso = filter.recurso
    if (filter.acao) where.acao = filter.acao
    if (filter.ativo === true) where.ativo = true
    if (filter.ativo === false) where.ativo = false

    const skip = (filter.pagina - 1) * filter.limite

    const [rows, total] = await Promise.all([
      prisma.securityFieldPolicy.findMany({
        where,
        include: { alvos: true },
        orderBy: [
          { recurso: 'asc' },
          { acao: 'asc' },
          { caminhoCampo: 'asc' },
          { prioridade: 'desc' },
          { id: 'desc' },
        ],
        skip,
        take: filter.limite,
      }),
      prisma.securityFieldPolicy.count({ where }),
    ])

    return { rows, total }
  }

  async getPolicyById(tenantId: number, id: number): Promise<unknown | null> {
    const policy = await prisma.securityFieldPolicy
      .findUnique({ where: { id } })
      .catch(() => null)
    if (!policy || (policy as { tenantId: number }).tenantId !== tenantId) return null
    return policy
  }

  async createPolicy(tenantId: number, input: CreatePolicyInput): Promise<unknown> {
    return prisma.$transaction(async (tx) => {
      const policy = await tx.securityFieldPolicy.create({
        data: {
          tenantId,
          recurso: input.recurso,
          acao: input.acao,
          caminhoCampo: input.caminhoCampo,
          efeitoCampo: input.efeitoCampo,
          estrategiaMascara: input.estrategiaMascara ?? null,
          prioridade: input.prioridade,
          condicaoJson: (input.condicaoJson ?? Prisma.JsonNull) as Prisma.InputJsonValue,
          ativo: input.ativo,
          criadoPorUserId: input.criadoPorUserId,
          atualizadoPorUserId: input.atualizadoPorUserId,
        },
      })

      if (input.alvos.length > 0) {
        await tx.securityFieldPolicyTarget.createMany({
          data: input.alvos.map((t) => ({
            policyId: policy.id,
            tipoAlvo: t.tipoAlvo,
            userId: typeof t.userId === 'number' ? t.userId : null,
            perfilCodigo: t.perfilCodigo ? String(t.perfilCodigo) : null,
            permissao: t.permissao ? String(t.permissao) : null,
            ativo: t.ativo,
          })),
        })
      }

      return tx.securityFieldPolicy.findUnique({
        where: { id: policy.id },
        include: { alvos: true },
      })
    })
  }

  async updatePolicy(tenantId: number, id: number, input: UpdatePolicyInput): Promise<unknown> {
    return prisma.$transaction(async (tx) => {
      await tx.securityFieldPolicy.update({
        where: { id },
        data: {
          recurso: input.recurso,
          acao: input.acao,
          caminhoCampo: input.caminhoCampo,
          efeitoCampo: input.efeitoCampo,
          estrategiaMascara: input.estrategiaMascara ?? null,
          prioridade: input.prioridade,
          condicaoJson: (input.condicaoJson ?? Prisma.JsonNull) as Prisma.InputJsonValue,
          ativo: input.ativo,
          atualizadoPorUserId: input.atualizadoPorUserId,
        },
      })

      await tx.securityFieldPolicyTarget.deleteMany({ where: { policyId: id } })

      if (input.alvos.length > 0) {
        await tx.securityFieldPolicyTarget.createMany({
          data: input.alvos.map((t) => ({
            policyId: id,
            tipoAlvo: t.tipoAlvo,
            userId: typeof t.userId === 'number' ? t.userId : null,
            perfilCodigo: t.perfilCodigo ? String(t.perfilCodigo) : null,
            permissao: t.permissao ? String(t.permissao) : null,
            ativo: t.ativo,
          })),
        })
      }

      return tx.securityFieldPolicy.findUnique({
        where: { id },
        include: { alvos: true },
      })
    })
  }

  async findTenantUser(input: CheckTenantUserInput): Promise<TenantUserRole | null> {
    return prisma.tenantUser.findUnique({
      where: { tenantId_userId: { tenantId: input.tenantId, userId: input.userId } },
      select: { id: true, role: true },
    })
  }

  async findSystemEncarregado(tenantId: number): Promise<{ userId: number | null } | null> {
    return prisma.empresaEncarregadoSistema.findFirst({
      where: { tenantId, ativo: true },
      orderBy: { id: 'desc' },
      select: { userId: true },
    })
  }

  async listAuditLogs(tenantId: number, filter: ListAuditLogsFilter): Promise<ListAuditLogsResult> {
    const where: Record<string, unknown> = { tenantId }
    if (filter.recurso) where.recurso = filter.recurso
    if (filter.acao) where.acao = filter.acao
    if (typeof filter.userId === 'number') where.userId = filter.userId

    const skip = (filter.pagina - 1) * filter.limite

    const [rows, total] = await Promise.all([
      prisma.securitySensitiveDataAudit.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip,
        take: filter.limite,
      }),
      prisma.securitySensitiveDataAudit.count({ where }),
    ])

    return { rows, total }
  }
}
