import type { IAdminRepository } from '@/modules/admin/domain/ports/IAdminRepository.js'

export class GetTenantHistory {
  constructor(private readonly repo: IAdminRepository) {}

  execute(tenantId: number) {
    return this.repo.getTenantHistory(tenantId)
  }
}
