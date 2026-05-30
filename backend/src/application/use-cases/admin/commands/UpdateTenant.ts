import type { IAdminRepository } from '@/domain/repositories/IAdminRepository.js'
import type { UpdateTenantDto } from '@/application/dto/admin/updateTenantDto.js'

export class UpdateTenant {
  constructor(private readonly repo: IAdminRepository) {}

  execute(id: number, input: UpdateTenantDto, actorUserId?: number | null) {
    return this.repo.updateTenant(id, input, actorUserId)
  }
}
