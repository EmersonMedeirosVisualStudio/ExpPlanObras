import type { IGovernancaDadosRepository, ListQualidadeRegraFilter } from '@/domain/repositories/IGovernancaDadosRepository.js'

export class ListQualidadeRegrasUseCase {
  constructor(private readonly repo: IGovernancaDadosRepository) {}

  async execute(tenantId: number, filter: ListQualidadeRegraFilter) {
    return this.repo.listQualidadeRegras(tenantId, filter)
  }

  async executeByAtivo(tenantId: number, ativoId: number) {
    return this.repo.listQualidadeRegrasByAtivo(tenantId, ativoId)
  }
}
