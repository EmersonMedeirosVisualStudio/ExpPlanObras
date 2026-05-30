import type { IGovernancaDadosRepository, ListClassificacaoSugestoesFilter } from '@/domain/repositories/IGovernancaDadosRepository.js'

export class ListClassificacoesUseCase {
  constructor(private readonly repo: IGovernancaDadosRepository) {}

  async execute(tenantId: number, filter: ListClassificacaoSugestoesFilter) {
    return this.repo.listClassificacaoSugestoes(tenantId, filter)
  }
}
