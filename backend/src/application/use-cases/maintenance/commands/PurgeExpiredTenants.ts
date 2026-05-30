import type { IMaintenanceRepository } from '@/domain/repositories/IMaintenanceRepository.js'

export class PurgeExpiredTenants {
  constructor(private readonly repo: IMaintenanceRepository) {}

  execute() {
    return this.repo.purgeExpiredTenants()
  }
}
