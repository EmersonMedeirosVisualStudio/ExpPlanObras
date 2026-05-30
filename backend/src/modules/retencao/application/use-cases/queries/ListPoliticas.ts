import type { IRetencaoRepository, ListPoliticasFilter } from '@/modules/retencao/domain/ports/IRetencaoRepository.js'

export class ListPoliticasUseCase {
  constructor(private readonly repo: IRetencaoRepository) {}

  async execute(tenantId: number, filter: ListPoliticasFilter) {
    return this.repo.listPoliticas(tenantId, filter)
  }
}
