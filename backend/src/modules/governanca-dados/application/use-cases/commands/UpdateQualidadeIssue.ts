import type { IGovernancaDadosRepository, UpdateQualidadeIssueInput } from '@/modules/governanca-dados/domain/ports/IGovernancaDadosRepository.js'

export class UpdateQualidadeIssueUseCase {
  constructor(private readonly repo: IGovernancaDadosRepository) {}

  async execute(tenantId: number, id: number, input: UpdateQualidadeIssueInput) {
    return this.repo.updateQualidadeIssue(tenantId, id, input)
  }
}
