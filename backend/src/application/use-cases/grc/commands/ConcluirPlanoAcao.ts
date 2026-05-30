import type { IGrcRepository } from '@/domain/repositories/IGrcRepository.js'
import { GrcPlanoAcaoNotFoundError } from '@/domain/errors/GrcErrors.js'

export interface ConcluirPlanoAcaoInput {
  id: number
  tenantId: number
}

export class ConcluirPlanoAcao {
  constructor(private readonly repo: IGrcRepository) {}

  async execute(input: ConcluirPlanoAcaoInput) {
    const plano = await this.repo.findUniquePlanoAcao(input.id)
    if (!plano || plano.tenantId !== input.tenantId) {
      throw new GrcPlanoAcaoNotFoundError(input.id)
    }
    await this.repo.updatePlanoAcao(plano.id, {
      statusPlano: 'CONCLUIDO',
      concluidoEm: new Date(),
    })
  }
}
