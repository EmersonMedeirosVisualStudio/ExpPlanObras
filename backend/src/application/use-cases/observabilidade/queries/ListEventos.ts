import type { IObservabilidadeRepository, ListEventosFilter, PaginatedResult } from '@/domain/repositories/IObservabilidadeRepository.js'

export class ListEventosUseCase {
  constructor(private readonly repo: IObservabilidadeRepository) {}

  async execute(tenantId: number, filter: ListEventosFilter): Promise<PaginatedResult<unknown>> {
    return this.repo.listEventos(tenantId, filter)
  }
}
