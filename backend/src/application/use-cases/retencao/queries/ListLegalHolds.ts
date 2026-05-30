import type { IRetencaoRepository } from '@/domain/repositories/IRetencaoRepository.js'

export class ListLegalHoldsUseCase {
  constructor(private readonly repo: IRetencaoRepository) {}

  async execute(tenantId: number) {
    return this.repo.listLegalHolds(tenantId)
  }
}
