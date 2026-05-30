import type { IGovernancaDadosRepository, ListGlossarioFilter } from '@/domain/repositories/IGovernancaDadosRepository.js'

export class ListGlossarioUseCase {
  constructor(private readonly repo: IGovernancaDadosRepository) {}

  async execute(tenantId: number, filter: ListGlossarioFilter) {
    return this.repo.listGlossario(tenantId, filter)
  }
}
