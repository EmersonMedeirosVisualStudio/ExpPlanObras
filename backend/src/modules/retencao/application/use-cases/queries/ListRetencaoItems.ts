import type { IRetencaoRepository, ListRetencaoItemsFilter } from '@/modules/retencao/domain/ports/IRetencaoRepository.js'

export class ListRetencaoItemsUseCase {
  constructor(private readonly repo: IRetencaoRepository) {}

  async execute(tenantId: number, filter: ListRetencaoItemsFilter) {
    return this.repo.listRetencaoItems(tenantId, filter)
  }
}
