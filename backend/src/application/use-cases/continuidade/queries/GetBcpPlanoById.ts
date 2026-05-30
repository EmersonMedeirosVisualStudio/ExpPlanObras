import type { IContinuidadeRepository } from '@/domain/repositories/IContinuidadeRepository.js'
import { BcpPlanoNotFoundError } from '@/domain/errors/ContinuidadeErrors.js'

export class GetBcpPlanoByIdUseCase {
  constructor(private readonly repo: IContinuidadeRepository) {}

  async execute(tenantId: number, id: number) {
    const plano = await this.repo.getBcpPlanoById(tenantId, id)
    if (!plano) throw new BcpPlanoNotFoundError(id)
    return plano
  }
}
