import type { IGovernancaDadosRepository, UpdateQualidadeIssueInput } from '@/domain/repositories/IGovernancaDadosRepository.js'

export class UpdateQualidadeIssueUseCase {
  constructor(private readonly repo: IGovernancaDadosRepository) {}

  async execute(tenantId: number, id: number, input: UpdateQualidadeIssueInput) {
    return this.repo.updateQualidadeIssue(tenantId, id, input)
  }
}
