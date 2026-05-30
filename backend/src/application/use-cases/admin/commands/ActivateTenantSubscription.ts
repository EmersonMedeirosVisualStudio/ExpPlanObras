import type { IAdminRepository } from '@/domain/repositories/IAdminRepository.js'

export class ActivateTenantSubscription {
  constructor(private readonly repo: IAdminRepository) {}

  execute(id: number, months: number, actorUserId?: number | null) {
    return this.repo.activateSubscription(id, months, actorUserId)
  }
}
