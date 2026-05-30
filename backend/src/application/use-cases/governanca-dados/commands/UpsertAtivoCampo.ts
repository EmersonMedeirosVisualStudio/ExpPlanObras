import type { IGovernancaDadosRepository, UpsertAtivoCampoInput } from '@/domain/repositories/IGovernancaDadosRepository.js'
import { AtivoNotFoundError } from '@/domain/errors/GovernancaErrors.js'

export class UpsertAtivoCampoUseCase {
  constructor(private readonly repo: IGovernancaDadosRepository) {}

  async execute(tenantId: number, ativoId: number, input: Omit<UpsertAtivoCampoInput, 'ativoId'>) {
    const ativo = await this.repo.getAtivoById(tenantId, ativoId)
    if (!ativo) throw new AtivoNotFoundError(ativoId)
    return this.repo.upsertAtivoCampo({ ...input, ativoId })
  }
}
