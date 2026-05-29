import type { AbrangenciaContext } from '@/modules/obras/domain/entities/Obra.js'
import { ObraAccessDeniedError, ObraNotFoundError } from '@/modules/obras/domain/errors/ObraErrors.js'
import type { IObraRepository } from '@/modules/obras/domain/ports/IObraRepository.js'
import { canAccessObra } from '@/modules/obras/domain/entities/Obra.js'
import type { UpdateObraDto } from '@/modules/obras/application/dtos/updateObraDto.js'

export class UpdateObraUseCase {
  constructor(private readonly repo: IObraRepository) {}

  async execute(tenantId: number, id: number, input: UpdateObraDto, scope?: AbrangenciaContext) {
    if (!canAccessObra(id, scope)) throw new ObraAccessDeniedError()
    const updated = await this.repo.update(tenantId, id, input)
    if (!updated) throw new ObraNotFoundError(id)
    return updated
  }
}
