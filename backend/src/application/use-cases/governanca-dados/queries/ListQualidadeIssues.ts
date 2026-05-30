import type { IGovernancaDadosRepository, ListQualidadeIssuesFilter } from '@/domain/repositories/IGovernancaDadosRepository.js'
import { AtivoNotFoundError } from '@/domain/errors/GovernancaErrors.js'

export class ListQualidadeIssuesUseCase {
  constructor(private readonly repo: IGovernancaDadosRepository) {}

  async execute(tenantId: number, filter: ListQualidadeIssuesFilter) {
    return this.repo.listQualidadeIssues(tenantId, filter)
  }

  async executeByAtivo(tenantId: number, ativoId: number) {
    const ativo = await this.repo.getAtivoById(tenantId, ativoId)
    if (!ativo) throw new AtivoNotFoundError(ativoId)
    return this.repo.listQualidadeIssuesByAtivo(tenantId, ativoId)
  }
}
