import type { IMaintenanceRepository } from '@/modules/maintenance/domain/ports/IMaintenanceRepository.js'
import { expireTrials, processSubscriptionsDaily, purgeExpiredTenants } from '@/modules/maintenance/infrastructure/services/maintenanceOps.js'

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
