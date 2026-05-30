import type { IAdminRepository } from '@/domain/repositories/IAdminRepository.js'

export class DeleteTenant {
  constructor(private readonly repo: IAdminRepository) {}

  execute(id: number) {
    return this.repo.deleteTenant(id)
  }
}
