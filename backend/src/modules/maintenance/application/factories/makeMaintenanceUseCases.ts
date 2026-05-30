import { PrismaMaintenanceRepository } from '@/modules/maintenance/infrastructure/persistence/PrismaMaintenanceRepository.js'
import { ExpireTrials } from '@/modules/maintenance/application/use-cases/commands/ExpireTrials.js'
import { ProcessSubscriptionsDaily } from '@/modules/maintenance/application/use-cases/commands/ProcessSubscriptionsDaily.js'
import { PurgeExpiredTenants } from '@/modules/maintenance/application/use-cases/commands/PurgeExpiredTenants.js'

export function makeMaintenanceUseCases() {
  const repo = new PrismaMaintenanceRepository()
  return {
    purge: new PurgeExpiredTenants(repo),
    expireTrials: new ExpireTrials(repo),
    processDaily: new ProcessSubscriptionsDaily(repo),
  }
}
