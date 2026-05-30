import type { IGrcRepository } from '@/modules/grc/domain/ports/IGrcRepository.js'
import { GrcRiscoNotFoundError } from '@/modules/grc/domain/errors/GrcErrors.js'

export class GetRiscoById {
  constructor(private readonly repo: IGrcRepository) {}

  async execute(id: number, tenantId: number) {
    const risco = await this.repo.findUniqueRisco(id)
    if (!risco || risco.tenantId !== tenantId) throw new GrcRiscoNotFoundError(id)
    return risco
  }
}
