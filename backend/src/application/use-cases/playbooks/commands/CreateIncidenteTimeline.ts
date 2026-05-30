import type { IPlaybooksRepository } from '@/domain/repositories/IPlaybooksRepository.js'
import { IncidenteNotFoundError } from '@/domain/errors/PlaybooksErrors.js'

export interface CreateIncidenteTimelineInput {
  tenantId: number
  incidenteId: number
  tipoEventoTimeline: string
  titulo: string
  descricao?: string | null
  autorUserId: number
  metadataJson?: unknown
}

export class CreateIncidenteTimelineUseCase {
  constructor(private readonly repo: IPlaybooksRepository) {}

  async execute(input: CreateIncidenteTimelineInput): Promise<{ id: number }> {
    const inc = await this.repo.getIncidenteById(input.tenantId, input.incidenteId)
    if (!inc) throw new IncidenteNotFoundError(input.incidenteId)

    const { tenantId, ...rest } = input
    const created = (await this.repo.createIncidenteTimeline(tenantId, rest)) as { id: number }
    return { id: created.id }
  }
}
