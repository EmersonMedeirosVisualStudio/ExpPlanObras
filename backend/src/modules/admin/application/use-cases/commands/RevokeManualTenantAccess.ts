import type { IAdminRepository } from '@/modules/admin/domain/ports/IAdminRepository.js'

export class RevokeManualTenantAccess {
  constructor(private readonly repo: IAdminRepository) {}

  execute(id: number, input: { reason: string }, actorUserId?: number | null) {
    return this.repo.revokeAccess(id, input, actorUserId)
  }
}
