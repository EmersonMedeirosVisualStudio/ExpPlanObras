import prisma from '@/infra/database/prisma/client.js'
import type { IBillingRepository } from '@/domain/repositories/IBillingRepository.js'
import { createTenantCheckout } from '@/infra/providers/billing/billingOps.js'

export class PrismaBillingRepository implements IBillingRepository {
  createCheckout(tenantId: number, payerEmail: string, plan: 'ANNUAL' | 'BIENNIAL') {
    return createTenantCheckout(tenantId, payerEmail, plan)
  }

  async findTenantByCnpj(cnpj: string) {
    return prisma.tenant.findUnique({ where: { cnpj }, select: { id: true } })
  }
}
