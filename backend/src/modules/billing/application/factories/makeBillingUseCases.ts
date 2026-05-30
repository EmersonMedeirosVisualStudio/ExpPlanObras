import { PrismaBillingRepository } from '@/modules/billing/infrastructure/persistence/PrismaBillingRepository.js'
import { CreateCheckout } from '@/modules/billing/application/use-cases/commands/CreateCheckout.js'
import { CreateClaimCheckout } from '@/modules/billing/application/use-cases/commands/CreateClaimCheckout.js'

export function makeBillingUseCases() {
  const repo = new PrismaBillingRepository()
  return {
    createCheckout: new CreateCheckout(repo),
    createClaimCheckout: new CreateClaimCheckout(repo),
  }
}
