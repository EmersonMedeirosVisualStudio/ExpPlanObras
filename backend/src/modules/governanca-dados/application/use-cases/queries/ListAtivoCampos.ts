import type { IGovernancaDadosRepository } from '@/modules/governanca-dados/domain/ports/IGovernancaDadosRepository.js'
import { AtivoNotFoundError } from '@/modules/governanca-dados/domain/errors/GovernancaErrors.js'

export class ListAtivoCamposUseCase {
  constructor(private readonly repo: IGovernancaDadosRepository) {}

  async execute(tenantId: number, ativoId: number) {
    const ativo = await this.repo.getAtivoById(tenantId, ativoId)
    if (!ativo) throw new AtivoNotFoundError(ativoId)
    return this.repo.listAtivoCampos(ativoId)
  }
}
