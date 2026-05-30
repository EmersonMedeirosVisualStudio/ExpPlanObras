import type { IGrcRepository } from '@/domain/repositories/IGrcRepository.js'
import { GrcPlanoAcaoNotFoundError } from '@/domain/errors/GrcErrors.js'

export interface AprovarPlanoAcaoInput {
  id: number
  tenantId: number
  userId: number
}

export class AprovarPlanoAcao {
  constructor(private readonly repo: IGrcRepository) {}

  async execute(input: AprovarPlanoAcaoInput) {
    const plano = await this.repo.findUniquePlanoAcao(input.id)
    if (!plano || plano.tenantId !== input.tenantId) {
      throw new GrcPlanoAcaoNotFoundError(input.id)
    }
    await this.repo.updatePlanoAcao(plano.id, {
      statusPlano: 'EM_ANDAMENTO',
      aprovadorUserId: input.userId,
    })
  }
}
