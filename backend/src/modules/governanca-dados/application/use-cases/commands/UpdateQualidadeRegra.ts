import type { IGovernancaDadosRepository, UpdateQualidadeRegraInput } from '@/modules/governanca-dados/domain/ports/IGovernancaDadosRepository.js'
import { QualidadeRegraNotFoundError } from '@/modules/governanca-dados/domain/errors/GovernancaErrors.js'

export class UpdateQualidadeRegraUseCase {
  constructor(private readonly repo: IGovernancaDadosRepository) {}

  async execute(tenantId: number, id: number, input: UpdateQualidadeRegraInput) {
    const regra = await this.repo.getQualidadeRegraById(tenantId, id)
    if (!regra) throw new QualidadeRegraNotFoundError(id)
    return this.repo.updateQualidadeRegra(tenantId, id, input)
  }
}
