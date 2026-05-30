import type { IPlaybooksRepository } from '@/domain/repositories/IPlaybooksRepository.js'
import { IncidenteNotFoundError } from '@/domain/errors/PlaybooksErrors.js'

export interface ListIncidenteTimelineInput {
  tenantId: number
  incidenteId: number
}

export class ListIncidenteTimelineUseCase {
  constructor(private readonly repo: IPlaybooksRepository) {}

  async execute(input: ListIncidenteTimelineInput): Promise<unknown[]> {
    const inc = await this.repo.getIncidenteById(input.tenantId, input.incidenteId)
    if (!inc) throw new IncidenteNotFoundError(input.incidenteId)
    return this.repo.listIncidenteTimeline(input.tenantId, input.incidenteId)
  }
}
