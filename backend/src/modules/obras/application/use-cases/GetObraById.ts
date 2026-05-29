import type { AbrangenciaContext } from '../../domain/entities/Obra.js'
import { canAccessObra } from '../../domain/entities/Obra.js'
import { ObraAccessDeniedError, ObraNotFoundError } from '../../domain/errors/ObraErrors.js'
import type { IObraRepository } from '../../domain/ports/IObraRepository.js'

export class GetObraByIdUseCase {
  constructor(private readonly repo: IObraRepository) {}

  async execute(tenantId: number, id: number, scope?: AbrangenciaContext) {
    if (!canAccessObra(id, scope)) throw new ObraAccessDeniedError()
    const obra = await this.repo.findById(tenantId, id, scope)
    if (!obra) throw new ObraNotFoundError(id)
    return obra
  }
}
