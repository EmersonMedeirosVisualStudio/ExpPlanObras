import type { IAdminRepository } from '@/domain/repositories/IAdminRepository.js'

export class ResetRepresentativePassword {
  constructor(private readonly repo: IAdminRepository) {}

  execute(tenantId: number, newPassword: string) {
    return this.repo.resetRepresentativePassword(tenantId, newPassword)
  }
}
