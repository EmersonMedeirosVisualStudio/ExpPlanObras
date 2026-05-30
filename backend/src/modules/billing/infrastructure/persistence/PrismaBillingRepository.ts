import prisma from '@/plugins/prisma.js'
import type { IBillingRepository } from '@/modules/billing/domain/ports/IBillingRepository.js'
import { createTenantCheckout } from '@/modules/billing/infrastructure/services/billingOps.js'

export class PrismaBillingRepository implements IBillingRepository {
  createCheckout(tenantId: number, payerEmail: string, plan: 'ANNUAL' | 'BIENNIAL') {
    return createTenantCheckout(tenantId, payerEmail, plan)
  }

  async findTenantByCnpj(cnpj: string) {
    return prisma.tenant.findUnique({ where: { cnpj }, select: { id: true } })
  }
}
