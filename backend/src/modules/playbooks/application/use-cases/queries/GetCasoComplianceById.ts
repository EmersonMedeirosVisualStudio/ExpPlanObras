import type { IPlaybooksRepository } from '@/modules/playbooks/domain/ports/IPlaybooksRepository.js'
import { CasoComplianceNotFoundError } from '@/modules/playbooks/domain/errors/PlaybooksErrors.js'

export interface GetCasoComplianceByIdInput {
  tenantId: number
  id: number
}

export class GetCasoComplianceByIdUseCase {
  constructor(private readonly repo: IPlaybooksRepository) {}

  async execute(input: GetCasoComplianceByIdInput): Promise<unknown> {
    const row = await this.repo.getCasoComplianceById(input.tenantId, input.id)
    if (!row) throw new CasoComplianceNotFoundError(input.id)
    return row
  }
}
