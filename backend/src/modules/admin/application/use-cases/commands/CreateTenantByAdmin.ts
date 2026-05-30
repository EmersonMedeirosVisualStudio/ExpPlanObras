import type { IAdminRepository } from '@/modules/admin/domain/ports/IAdminRepository.js'
import type { CreateTenantDto } from '@/modules/admin/application/dtos/createTenantDto.js'

export class CreateTenantByAdmin {
  constructor(private readonly repo: IAdminRepository) {}

  execute(input: CreateTenantDto, actorUserId?: number | null) {
    return this.repo.createTenant(input, actorUserId)
  }
}
