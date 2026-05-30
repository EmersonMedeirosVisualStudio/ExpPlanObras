import type { IGovernancaDadosRepository, ListGlossarioFilter } from '@/modules/governanca-dados/domain/ports/IGovernancaDadosRepository.js'

export class ListGlossarioUseCase {
  constructor(private readonly repo: IGovernancaDadosRepository) {}

  async execute(tenantId: number, filter: ListGlossarioFilter) {
    return this.repo.listGlossario(tenantId, filter)
  }
}
