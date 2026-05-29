import type { AbrangenciaContext } from '@/modules/obras/domain/entities/Obra.js'
import { canAccessObra } from '@/modules/obras/domain/entities/Obra.js'
import { ObraAccessDeniedError, ObraNotFoundError } from '@/modules/obras/domain/errors/ObraErrors.js'
import type { IObraRepository } from '@/modules/obras/domain/ports/IObraRepository.js'

export class DeleteObraUseCase {
  constructor(private readonly repo: IObraRepository) {}

  async execute(tenantId: number, id: number, scope?: AbrangenciaContext): Promise<void> {
    if (!canAccessObra(id, scope)) throw new ObraAccessDeniedError()
    const obra = await this.repo.findById(tenantId, id, scope)
    if (!obra) throw new ObraNotFoundError(id)
    await this.repo.delete(tenantId, id)
  }
}
