import type { IGovernancaDadosRepository, CreateQualidadeRegraInput } from '@/domain/repositories/IGovernancaDadosRepository.js'
import { AtivoNotFoundError } from '@/domain/errors/GovernancaErrors.js'

export class CreateQualidadeRegraUseCase {
  constructor(private readonly repo: IGovernancaDadosRepository) {}

  async execute(tenantId: number, input: CreateQualidadeRegraInput) {
    const ativo = await this.repo.getAtivoById(tenantId, input.ativoId)
    if (!ativo) throw new AtivoNotFoundError(input.ativoId)
    return this.repo.createQualidadeRegra(tenantId, input)
  }
}
