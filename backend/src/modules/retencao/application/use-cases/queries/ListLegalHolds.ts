import type { IRetencaoRepository } from '@/modules/retencao/domain/ports/IRetencaoRepository.js'

export class ListLegalHoldsUseCase {
  constructor(private readonly repo: IRetencaoRepository) {}

  async execute(tenantId: number) {
    return this.repo.listLegalHolds(tenantId)
  }
}
