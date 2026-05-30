import type { IGovernancaDadosRepository, UpsertAtivoCampoInput } from '@/modules/governanca-dados/domain/ports/IGovernancaDadosRepository.js'
import { AtivoNotFoundError } from '@/modules/governanca-dados/domain/errors/GovernancaErrors.js'

export class UpsertAtivoCampoUseCase {
  constructor(private readonly repo: IGovernancaDadosRepository) {}

  async execute(tenantId: number, ativoId: number, input: Omit<UpsertAtivoCampoInput, 'ativoId'>) {
    const ativo = await this.repo.getAtivoById(tenantId, ativoId)
    if (!ativo) throw new AtivoNotFoundError(ativoId)
    return this.repo.upsertAtivoCampo({ ...input, ativoId })
  }
}
