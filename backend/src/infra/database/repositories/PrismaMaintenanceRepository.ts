import type { IMaintenanceRepository } from '@/domain/repositories/IMaintenanceRepository.js'
import { expireTrials, processSubscriptionsDaily, purgeExpiredTenants } from '@/infra/providers/maintenance/maintenanceOps.js'

export class PrismaMaintenanceRepository implements IMaintenanceRepository {
  purgeExpiredTenants() {
    return purgeExpiredTenants()
  }

  expireTrials() {
    return expireTrials()
  }

  processSubscriptionsDaily() {
    return processSubscriptionsDaily()
  }
}
