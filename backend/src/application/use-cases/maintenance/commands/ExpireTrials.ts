import type { IMaintenanceRepository } from '@/domain/repositories/IMaintenanceRepository.js'

export class ExpireTrials {
  constructor(private readonly repo: IMaintenanceRepository) {}

  execute() {
    return this.repo.expireTrials()
  }
}
