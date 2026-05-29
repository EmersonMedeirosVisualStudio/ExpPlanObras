import type { IContratoRepository } from '@/modules/contratos/domain/ports/IContratoRepository.js'
import { ContratoConflictError, ContratoNotFoundError } from '@/modules/contratos/domain/errors/ContratoErrors.js'
import type { UpdateContratoDto } from '@/modules/contratos/application/dtos/updateContratoDto.js'

export class UpdateContratoUseCase {
  constructor(private readonly repo: IContratoRepository) {}

  async execute(tenantId: number, id: number, input: UpdateContratoDto) {
    try {
      const result = await this.repo.update(tenantId, id, input)
      if (!result) throw new ContratoNotFoundError(id)
      return result
    } catch (err: unknown) {
      if ((err as { code?: string })?.code === 'P2002') throw new ContratoConflictError((input as { numeroContrato?: string }).numeroContrato ?? '')
      throw err
    }
  }
}
