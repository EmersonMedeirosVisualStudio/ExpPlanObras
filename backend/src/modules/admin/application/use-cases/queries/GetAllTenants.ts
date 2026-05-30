import type { IAdminRepository } from '@/modules/admin/domain/ports/IAdminRepository.js'

export class GetAllTenants {
  constructor(private readonly repo: IAdminRepository) {}

  execute() {
    return this.repo.listTenants()
  }
}
