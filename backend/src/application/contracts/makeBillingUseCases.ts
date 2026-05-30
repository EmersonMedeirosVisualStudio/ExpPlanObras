import { PrismaBillingRepository } from '@/infra/database/repositories/PrismaBillingRepository.js'
import { CreateCheckout } from '@/application/use-cases/billing/commands/CreateCheckout.js'
import { CreateClaimCheckout } from '@/application/use-cases/billing/commands/CreateClaimCheckout.js'

export function makeBillingUseCases() {
  const repo = new PrismaBillingRepository()
  return {
    createCheckout: new CreateCheckout(repo),
    createClaimCheckout: new CreateClaimCheckout(repo),
  }
}
