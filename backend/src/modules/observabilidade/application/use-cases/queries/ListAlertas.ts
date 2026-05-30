import type { IObservabilidadeRepository, ListAlertasFilter, PaginatedResult } from '@/modules/observabilidade/domain/ports/IObservabilidadeRepository.js'

export class ListAlertasUseCase {
  constructor(private readonly repo: IObservabilidadeRepository) {}

  async execute(tenantId: number, filter: ListAlertasFilter): Promise<PaginatedResult<unknown>> {
    return this.repo.listAlertas(tenantId, filter)
  }
}
