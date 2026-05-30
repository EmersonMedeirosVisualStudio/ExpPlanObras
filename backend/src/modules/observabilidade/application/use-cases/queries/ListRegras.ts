import type { IObservabilidadeRepository, ListRegrasFilter, PaginatedResult } from '@/modules/observabilidade/domain/ports/IObservabilidadeRepository.js'

export class ListRegrasUseCase {
  constructor(private readonly repo: IObservabilidadeRepository) {}

  async execute(tenantId: number, filter: ListRegrasFilter): Promise<PaginatedResult<unknown>> {
    return this.repo.listRegras(tenantId, filter)
  }
}
