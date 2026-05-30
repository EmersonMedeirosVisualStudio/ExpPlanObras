import type { IObservabilidadeRepository } from '@/modules/observabilidade/domain/ports/IObservabilidadeRepository.js'

export class GetIncidenteByIdUseCase {
  constructor(private readonly repo: IObservabilidadeRepository) {}

  async execute(tenantId: number, id: number): Promise<unknown | null> {
    return this.repo.getIncidenteById(tenantId, id)
  }
}
