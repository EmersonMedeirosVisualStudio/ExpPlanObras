import type { IGovernancaDadosRepository, ListPiiScansFilter } from '@/modules/governanca-dados/domain/ports/IGovernancaDadosRepository.js'

export class ListPiiScansUseCase {
  constructor(private readonly repo: IGovernancaDadosRepository) {}

  async execute(tenantId: number, filter: ListPiiScansFilter) {
    return this.repo.listPiiScans(tenantId, filter)
  }
}
