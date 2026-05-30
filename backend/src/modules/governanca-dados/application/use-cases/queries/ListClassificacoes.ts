import type { IGovernancaDadosRepository, ListClassificacaoSugestoesFilter } from '@/modules/governanca-dados/domain/ports/IGovernancaDadosRepository.js'

export class ListClassificacoesUseCase {
  constructor(private readonly repo: IGovernancaDadosRepository) {}

  async execute(tenantId: number, filter: ListClassificacaoSugestoesFilter) {
    return this.repo.listClassificacaoSugestoes(tenantId, filter)
  }
}
