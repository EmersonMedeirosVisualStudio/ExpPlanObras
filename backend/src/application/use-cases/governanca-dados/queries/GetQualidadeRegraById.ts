import type { IGovernancaDadosRepository } from '@/domain/repositories/IGovernancaDadosRepository.js'
import { QualidadeRegraNotFoundError } from '@/domain/errors/GovernancaErrors.js'

export class GetQualidadeRegraByIdUseCase {
  constructor(private readonly repo: IGovernancaDadosRepository) {}

  async execute(tenantId: number, id: number) {
    const regra = await this.repo.getQualidadeRegraById(tenantId, id)
    if (!regra) throw new QualidadeRegraNotFoundError(id)
    return regra
  }
}
