import type { IAdminRepository } from '@/modules/admin/domain/ports/IAdminRepository.js'

export class DeleteTenant {
  constructor(private readonly repo: IAdminRepository) {}

  execute(id: number) {
    return this.repo.deleteTenant(id)
  }
}
