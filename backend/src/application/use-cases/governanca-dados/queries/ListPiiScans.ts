import type { IGovernancaDadosRepository, ListPiiScansFilter } from '@/domain/repositories/IGovernancaDadosRepository.js'

export class ListPiiScansUseCase {
  constructor(private readonly repo: IGovernancaDadosRepository) {}

  async execute(tenantId: number, filter: ListPiiScansFilter) {
    return this.repo.listPiiScans(tenantId, filter)
  }
}
