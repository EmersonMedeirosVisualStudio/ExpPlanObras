import type { IObservabilidadeRepository, ListIncidentesFilter, PaginatedResult } from '@/domain/repositories/IObservabilidadeRepository.js'

export class ListIncidentesUseCase {
  constructor(private readonly repo: IObservabilidadeRepository) {}

  async execute(tenantId: number, filter: ListIncidentesFilter): Promise<PaginatedResult<unknown>> {
    return this.repo.listIncidentes(tenantId, filter)
  }
}
