import type { IRetencaoRepository } from '@/domain/repositories/IRetencaoRepository.js'

export class ListDescarteLotesUseCase {
  constructor(private readonly repo: IRetencaoRepository) {}

  async execute(tenantId: number) {
    return this.repo.listDescarteLotes(tenantId)
  }
}
