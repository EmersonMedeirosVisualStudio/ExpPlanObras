import type { IGovernancaDadosRepository } from '@/domain/repositories/IGovernancaDadosRepository.js'
import { AtivoNotFoundError } from '@/domain/errors/GovernancaErrors.js'

export class ListLineageRelacoesUseCase {
  constructor(private readonly repo: IGovernancaDadosRepository) {}

  async execute(tenantId: number, ativoId: number) {
    const ativo = await this.repo.getAtivoById(tenantId, ativoId)
    if (!ativo) throw new AtivoNotFoundError(ativoId)
    return this.repo.listLineageByAtivo(tenantId, ativoId)
  }
}
