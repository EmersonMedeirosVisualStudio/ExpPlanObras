import type { IAdminRepository } from '@/modules/admin/domain/ports/IAdminRepository.js'
import type { UpdateTenantDto } from '@/modules/admin/application/dtos/updateTenantDto.js'

export class UpdateTenant {
  constructor(private readonly repo: IAdminRepository) {}

  execute(id: number, input: UpdateTenantDto, actorUserId?: number | null) {
    return this.repo.updateTenant(id, input, actorUserId)
  }
}
