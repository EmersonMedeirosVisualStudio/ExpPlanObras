import type { IGovernancaDadosRepository, ListQualidadeIssuesFilter } from '@/modules/governanca-dados/domain/ports/IGovernancaDadosRepository.js'
import { AtivoNotFoundError } from '@/modules/governanca-dados/domain/errors/GovernancaErrors.js'

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
