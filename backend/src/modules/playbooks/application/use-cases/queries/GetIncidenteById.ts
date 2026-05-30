import type { IPlaybooksRepository } from '@/modules/playbooks/domain/ports/IPlaybooksRepository.js'
import { IncidenteNotFoundError } from '@/modules/playbooks/domain/errors/PlaybooksErrors.js'

export interface GetIncidenteByIdInput {
  tenantId: number
  id: number
}

export class GetIncidenteByIdUseCase {
  constructor(private readonly repo: IPlaybooksRepository) {}

  async execute(input: GetIncidenteByIdInput): Promise<unknown> {
    const inc = await this.repo.getIncidenteById(input.tenantId, input.id)
    if (!inc) throw new IncidenteNotFoundError(input.id)
    return inc
  }
}
