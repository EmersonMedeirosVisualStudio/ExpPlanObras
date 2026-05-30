import type { IAdminRepository } from '@/modules/admin/domain/ports/IAdminRepository.js'

export class ResetRepresentativePassword {
  constructor(private readonly repo: IAdminRepository) {}

  execute(tenantId: number, newPassword: string) {
    return this.repo.resetRepresentativePassword(tenantId, newPassword)
  }
}
