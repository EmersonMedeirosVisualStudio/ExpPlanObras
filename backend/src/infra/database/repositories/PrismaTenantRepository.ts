import prisma from '@/infra/database/prisma/client.js'
import type { Tenant } from '@/domain/entities/Tenant.js'
import type { UserTenant } from '@/domain/entities/User.js'
import type { CreateTenantInput, ITenantRepository } from '@/domain/repositories/ITenantRepository.js'

export class PrismaTenantRepository implements ITenantRepository {
  async findById(id: number): Promise<Tenant | null> {
    return prisma.tenant.findUnique({
      where: { id },
      select: { id: true, name: true, slug: true, status: true, subscriptionStatus: true, trialEndsAt: true, paidUntil: true, gracePeriodEndsAt: true },
    }) as Promise<Tenant | null>
  }

  async getUserTenants(userId: number): Promise<UserTenant[]> {
    const rows = await prisma.tenantUser.findMany({
      where: { userId },
      include: { tenant: true },
    })
    return (rows as Array<{ tenantId: number; role: string; funcionarioId: number | null; tenant: { name: string; slug: string } }>).map((r) => ({
      tenantId: r.tenantId,
      role: r.role,
      name: r.tenant.name,
      slug: r.tenant.slug,
      funcionarioId: r.funcionarioId ?? null,
    }))
  }

  async findTenantUser(tenantId: number, userId: number): Promise<{ role: string; tenant: Tenant } | null> {
    const row = await prisma.tenantUser.findUnique({
      where: { tenantId_userId: { tenantId, userId } },
      include: { tenant: true },
    })
    if (!row) return null
    return { role: row.role, tenant: row.tenant as unknown as Tenant }
  }

  async createWithOwner(
    tenantInput: CreateTenantInput,
    userId: number,
    ownerName: string,
    ownerCpf: string | null,
    ownerEmail: string,
  ): Promise<Tenant> {
    return prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: {
          name: tenantInput.name,
          slug: tenantInput.slug,
          cnpj: tenantInput.cnpj ?? '',
          companyEmail: tenantInput.companyEmail ?? '',
          companyWhatsapp: tenantInput.companyWhatsapp ?? null,
          link: tenantInput.link ?? null,
          street: tenantInput.street ?? null,
          number: tenantInput.number ?? null,
          neighborhood: tenantInput.neighborhood ?? null,
          city: tenantInput.city ?? null,
          state: tenantInput.state ?? null,
          cep: tenantInput.cep ?? '',
          latitude: tenantInput.latitude != null ? String(tenantInput.latitude) : null,
          longitude: tenantInput.longitude != null ? String(tenantInput.longitude) : null,
          status: 'ACTIVE',
          subscriptionStatus: 'TRIAL',
        },
      })
      await tx.tenantUser.create({ data: { tenantId: tenant.id, userId, role: 'ADMIN' } })
      await tx.empresaRepresentante.create({
        data: { tenantId: tenant.id, funcionarioId: null, nomeRepresentante: ownerName, cpf: ownerCpf ?? '', email: ownerEmail, ativo: true, dataInicio: new Date(), dataFim: null },
      })
      return tenant as unknown as Tenant
    })
  }
}
