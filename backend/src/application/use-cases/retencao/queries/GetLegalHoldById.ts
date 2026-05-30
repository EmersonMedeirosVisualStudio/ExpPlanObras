import type { IRetencaoRepository } from '@/domain/repositories/IRetencaoRepository.js'
import { LegalHoldNotFoundError } from '@/domain/errors/RetencaoErrors.js'

export class GetLegalHoldByIdUseCase {
  constructor(private readonly repo: IRetencaoRepository) {}

  async execute(tenantId: number, id: number) {
    const hold = await this.repo.getLegalHoldById(tenantId, id)
    if (!hold) throw new LegalHoldNotFoundError(id)
    return hold
  }
}
