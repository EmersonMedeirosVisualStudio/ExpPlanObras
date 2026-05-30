import type { IRetencaoRepository, ListRetencaoItemsFilter } from '@/domain/repositories/IRetencaoRepository.js'

export class ListRetencaoItemsUseCase {
  constructor(private readonly repo: IRetencaoRepository) {}

  async execute(tenantId: number, filter: ListRetencaoItemsFilter) {
    return this.repo.listRetencaoItems(tenantId, filter)
  }
}
