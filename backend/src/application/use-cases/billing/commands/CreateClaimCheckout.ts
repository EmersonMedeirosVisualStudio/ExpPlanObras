import type { IBillingRepository } from '@/domain/repositories/IBillingRepository.js'

export class CreateClaimCheckout {
  constructor(private readonly repo: IBillingRepository) {}

  async execute(cnpj: string, email: string, plan: 'ANNUAL' | 'BIENNIAL') {
    const tenant = await this.repo.findTenantByCnpj(cnpj)
    if (!tenant) throw new Error('Empresa não encontrada')
    return this.repo.createCheckout(tenant.id, email, plan)
  }
}
