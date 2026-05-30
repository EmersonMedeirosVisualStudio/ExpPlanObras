import type { IContinuidadeRepository } from '@/modules/continuidade/domain/ports/IContinuidadeRepository.js'
import { BcpPlanoNotFoundError } from '@/modules/continuidade/domain/errors/ContinuidadeErrors.js'

export class GetBcpPlanoByIdUseCase {
  constructor(private readonly repo: IContinuidadeRepository) {}

  async execute(tenantId: number, id: number) {
    const plano = await this.repo.getBcpPlanoById(tenantId, id)
    if (!plano) throw new BcpPlanoNotFoundError(id)
    return plano
  }
}
