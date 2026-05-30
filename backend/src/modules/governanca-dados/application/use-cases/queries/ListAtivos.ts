import type { IGovernancaDadosRepository, ListAtivosFilter } from '@/modules/governanca-dados/domain/ports/IGovernancaDadosRepository.js'

export class ListAtivosUseCase {
  constructor(private readonly repo: IGovernancaDadosRepository) {}

  async execute(tenantId: number, filter: ListAtivosFilter) {
    return this.repo.listAtivos(tenantId, filter)
  }
}
