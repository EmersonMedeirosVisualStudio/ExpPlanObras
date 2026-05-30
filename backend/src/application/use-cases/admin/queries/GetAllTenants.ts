import type { IAdminRepository } from '@/domain/repositories/IAdminRepository.js'

export class GetAllTenants {
  constructor(private readonly repo: IAdminRepository) {}

  execute() {
    return this.repo.listTenants()
  }
}
