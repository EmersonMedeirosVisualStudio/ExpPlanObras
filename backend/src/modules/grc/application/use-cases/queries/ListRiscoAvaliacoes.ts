import type { IGrcRepository } from '@/modules/grc/domain/ports/IGrcRepository.js'
import { GrcRiscoNotFoundError } from '@/modules/grc/domain/errors/GrcErrors.js'

export class ListRiscoAvaliacoes {
  constructor(private readonly repo: IGrcRepository) {}

  async execute(riscoId: number, tenantId: number) {
    const risco = await this.repo.findUniqueRisco(riscoId)
    if (!risco || risco.tenantId !== tenantId) throw new GrcRiscoNotFoundError(riscoId)
    return this.repo.findManyRiscoAvaliacoes(tenantId, riscoId)
  }
}
