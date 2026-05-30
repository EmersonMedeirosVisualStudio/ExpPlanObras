import type { IAdminRepository } from '@/modules/admin/domain/ports/IAdminRepository.js'

export class AcceptClaimAsAdmin {
  constructor(private readonly repo: IAdminRepository) {}

  execute(input: { cnpj: string; email: string; plan: 'ANNUAL' | 'BIENNIAL' }, actorUserId?: number | null) {
    return this.repo.acceptClaim(input, actorUserId)
  }
}
