import type { IAdminRepository } from '@/domain/repositories/IAdminRepository.js'

export class GetTenantHistory {
  constructor(private readonly repo: IAdminRepository) {}

  execute(tenantId: number) {
    return this.repo.getTenantHistory(tenantId)
  }
}
