import type { IMaintenanceRepository } from '@/modules/maintenance/domain/ports/IMaintenanceRepository.js'

export class ExpireTrials {
  constructor(private readonly repo: IMaintenanceRepository) {}

  execute() {
    return this.repo.expireTrials()
  }
}
