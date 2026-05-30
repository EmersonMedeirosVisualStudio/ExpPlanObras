import type { IGovernancaDadosRepository } from '@/domain/repositories/IGovernancaDadosRepository.js'
import { AtivoNotFoundError } from '@/domain/errors/GovernancaErrors.js'

export class GetAtivoByIdUseCase {
  constructor(private readonly repo: IGovernancaDadosRepository) {}

  async execute(tenantId: number, id: number) {
    const ativo = await this.repo.getAtivoById(tenantId, id)
    if (!ativo) throw new AtivoNotFoundError(id)
    return ativo
  }
}
