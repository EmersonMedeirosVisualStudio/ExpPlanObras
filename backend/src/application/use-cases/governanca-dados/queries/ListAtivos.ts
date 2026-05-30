import type { IGovernancaDadosRepository, ListAtivosFilter } from '@/domain/repositories/IGovernancaDadosRepository.js'

export class ListAtivosUseCase {
  constructor(private readonly repo: IGovernancaDadosRepository) {}

  async execute(tenantId: number, filter: ListAtivosFilter) {
    return this.repo.listAtivos(tenantId, filter)
  }
}
