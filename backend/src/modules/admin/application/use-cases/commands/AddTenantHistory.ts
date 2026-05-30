import type { IAdminRepository } from '@/modules/admin/domain/ports/IAdminRepository.js'

export class AddTenantHistory {
  constructor(private readonly repo: IAdminRepository) {}

  execute(tenantId: number, input: { message: string; attachmentUrls?: string[] }, actorUserId?: number | null) {
    return this.repo.addTenantHistory(tenantId, input, actorUserId)
  }
}
