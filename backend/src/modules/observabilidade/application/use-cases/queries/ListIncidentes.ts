import type { IObservabilidadeRepository, ListIncidentesFilter, PaginatedResult } from '@/modules/observabilidade/domain/ports/IObservabilidadeRepository.js'

export class ListIncidentesUseCase {
  constructor(private readonly repo: IObservabilidadeRepository) {}

  async execute(tenantId: number, filter: ListIncidentesFilter): Promise<PaginatedResult<unknown>> {
    return this.repo.listIncidentes(tenantId, filter)
  }
}
