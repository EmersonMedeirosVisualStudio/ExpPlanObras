import type { IGrcRepository } from '@/domain/repositories/IGrcRepository.js'
import { GrcAchadoNotFoundError } from '@/domain/errors/GrcErrors.js'

export interface EncerrarAchadoInput {
  id: number
  tenantId: number
}

export class EncerrarAchado {
  constructor(private readonly repo: IGrcRepository) {}

  async execute(input: EncerrarAchadoInput) {
    const achado = await this.repo.findUniqueAchado(input.id)
    if (!achado || achado.tenantId !== input.tenantId) {
      throw new GrcAchadoNotFoundError(input.id)
    }
    await this.repo.updateAchado(achado.id, { statusAchado: 'ENCERRADO' })
  }
}
