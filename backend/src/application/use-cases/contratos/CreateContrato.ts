import type { IContratoRepository } from '@/domain/repositories/IContratoRepository.js'
import { ContratoConflictError } from '@/domain/errors/ContratoErrors.js'
import type { CreateContratoDto } from '@/application/dto/contratos/createContratoDto.js'

export class CreateContratoUseCase {
  constructor(private readonly repo: IContratoRepository) {}

  async execute(tenantId: number, input: CreateContratoDto) {
    try {
      return await this.repo.create(tenantId, input)
    } catch (err: unknown) {
      if ((err as { code?: string })?.code === 'P2002') throw new ContratoConflictError(input.numeroContrato)
      throw err
    }
  }
}
