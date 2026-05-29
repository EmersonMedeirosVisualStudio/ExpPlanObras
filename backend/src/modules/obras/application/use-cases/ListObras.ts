import type { AbrangenciaContext } from '@/modules/obras/domain/entities/Obra.js'
import type { IObraRepository } from '@/modules/obras/domain/ports/IObraRepository.js'

export class ListObrasUseCase {
  constructor(private readonly repo: IObraRepository) {}

  async execute(tenantId: number, scope?: AbrangenciaContext, filter?: { contratoId?: number }) {
    return this.repo.findAll(tenantId, scope, filter)
  }
}
