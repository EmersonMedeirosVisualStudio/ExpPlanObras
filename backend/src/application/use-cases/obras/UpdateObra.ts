import type { AbrangenciaContext } from '@/domain/entities/Obra.js'
import { ObraAccessDeniedError, ObraNotFoundError } from '@/domain/errors/ObraErrors.js'
import type { IObraRepository } from '@/domain/repositories/IObraRepository.js'
import { canAccessObra } from '@/domain/entities/Obra.js'
import type { UpdateObraDto } from '@/application/dto/obras/updateObraDto.js'

export class UpdateObraUseCase {
  constructor(private readonly repo: IObraRepository) {}

  async execute(tenantId: number, id: number, input: UpdateObraDto, scope?: AbrangenciaContext) {
    if (!canAccessObra(id, scope)) throw new ObraAccessDeniedError()
    const updated = await this.repo.update(tenantId, id, input)
    if (!updated) throw new ObraNotFoundError(id)
    return updated
  }
}
