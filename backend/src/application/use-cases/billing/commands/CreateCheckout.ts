import type { IBillingRepository } from '@/domain/repositories/IBillingRepository.js'

export class CreateCheckout {
  constructor(private readonly repo: IBillingRepository) {}

  execute(tenantId: number, payerEmail: string, plan: 'ANNUAL' | 'BIENNIAL') {
    return this.repo.createCheckout(tenantId, payerEmail, plan)
  }
}
