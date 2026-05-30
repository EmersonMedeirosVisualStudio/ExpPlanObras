import type { IAdminRepository } from '@/modules/admin/domain/ports/IAdminRepository.js'

export class ManualGrantTenantAccess {
  constructor(private readonly repo: IAdminRepository) {}

  execute(id: number, input: { reason: 'PAYMENT' | 'TRIAL_EXTENSION'; days: number }, actorUserId?: number | null) {
    return this.repo.grantAccess(id, input, actorUserId)
  }
}
