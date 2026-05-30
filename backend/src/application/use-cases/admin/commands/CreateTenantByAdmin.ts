import type { IAdminRepository } from '@/domain/repositories/IAdminRepository.js'
import type { CreateTenantDto } from '@/application/dto/admin/createTenantDto.js'

export class CreateTenantByAdmin {
  constructor(private readonly repo: IAdminRepository) {}

  execute(input: CreateTenantDto, actorUserId?: number | null) {
    return this.repo.createTenant(input, actorUserId)
  }
}
