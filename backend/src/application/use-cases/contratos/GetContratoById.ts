import type { IContratoRepository } from '@/domain/repositories/IContratoRepository.js'
import { ContratoNotFoundError } from '@/domain/errors/ContratoErrors.js'

export class GetContratoByIdUseCase {
  constructor(private readonly repo: IContratoRepository) {}

  async execute(tenantId: number, id: number) {
    const contrato = await this.repo.getById(tenantId, id)
    if (!contrato) throw new ContratoNotFoundError(id)
    return contrato
  }
}
