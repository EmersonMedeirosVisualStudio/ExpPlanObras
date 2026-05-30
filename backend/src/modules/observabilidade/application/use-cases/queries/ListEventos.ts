import type { IObservabilidadeRepository, ListEventosFilter, PaginatedResult } from '@/modules/observabilidade/domain/ports/IObservabilidadeRepository.js'

export class ListEventosUseCase {
  constructor(private readonly repo: IObservabilidadeRepository) {}

  async execute(tenantId: number, filter: ListEventosFilter): Promise<PaginatedResult<unknown>> {
    return this.repo.listEventos(tenantId, filter)
  }
}
