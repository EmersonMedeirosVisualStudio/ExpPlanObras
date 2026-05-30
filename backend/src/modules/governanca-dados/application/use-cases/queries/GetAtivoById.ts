import type { IGovernancaDadosRepository } from '@/modules/governanca-dados/domain/ports/IGovernancaDadosRepository.js'
import { AtivoNotFoundError } from '@/modules/governanca-dados/domain/errors/GovernancaErrors.js'

export class GetAtivoByIdUseCase {
  constructor(private readonly repo: IGovernancaDadosRepository) {}

  async execute(tenantId: number, id: number) {
    const ativo = await this.repo.getAtivoById(tenantId, id)
    if (!ativo) throw new AtivoNotFoundError(id)
    return ativo
  }
}
