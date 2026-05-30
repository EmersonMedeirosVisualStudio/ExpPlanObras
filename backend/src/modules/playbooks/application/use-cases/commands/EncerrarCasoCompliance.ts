import type { IPlaybooksRepository } from '@/modules/playbooks/domain/ports/IPlaybooksRepository.js'
import { CasoComplianceNotFoundError } from '@/modules/playbooks/domain/errors/PlaybooksErrors.js'

export interface EncerrarCasoComplianceInput {
  tenantId: number
  id: number
  parecerFinal: string
}

export class EncerrarCasoComplianceUseCase {
  constructor(private readonly repo: IPlaybooksRepository) {}

  async execute(input: EncerrarCasoComplianceInput): Promise<void> {
    const caso = await this.repo.getCasoComplianceById(input.tenantId, input.id)
    if (!caso) throw new CasoComplianceNotFoundError(input.id)

    await this.repo.updateCasoCompliance(input.tenantId, input.id, {
      statusCaso: 'CONCLUIDO',
      parecerFinal: input.parecerFinal,
    })
  }
}
