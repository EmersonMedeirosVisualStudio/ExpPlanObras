import type { IMaintenanceRepository } from '@/modules/maintenance/domain/ports/IMaintenanceRepository.js'

export class ProcessSubscriptionsDaily {
  constructor(private readonly repo: IMaintenanceRepository) {}

  execute() {
    return this.repo.processSubscriptionsDaily()
  }
}
