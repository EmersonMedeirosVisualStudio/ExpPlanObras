import type { IRetencaoRepository } from '@/modules/retencao/domain/ports/IRetencaoRepository.js'

export class ListDescarteLotesUseCase {
  constructor(private readonly repo: IRetencaoRepository) {}

  async execute(tenantId: number) {
    return this.repo.listDescarteLotes(tenantId)
  }
}
