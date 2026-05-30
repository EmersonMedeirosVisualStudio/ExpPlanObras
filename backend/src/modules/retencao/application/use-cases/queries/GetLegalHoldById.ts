import type { IRetencaoRepository } from '@/modules/retencao/domain/ports/IRetencaoRepository.js'
import { LegalHoldNotFoundError } from '@/modules/retencao/domain/errors/RetencaoErrors.js'

export class GetLegalHoldByIdUseCase {
  constructor(private readonly repo: IRetencaoRepository) {}

  async execute(tenantId: number, id: number) {
    const hold = await this.repo.getLegalHoldById(tenantId, id)
    if (!hold) throw new LegalHoldNotFoundError(id)
    return hold
  }
}
