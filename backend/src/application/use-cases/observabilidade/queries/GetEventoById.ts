import type { IObservabilidadeRepository } from '@/domain/repositories/IObservabilidadeRepository.js'

export class GetEventoByIdUseCase {
  constructor(private readonly repo: IObservabilidadeRepository) {}

  async execute(tenantId: number, id: number): Promise<unknown | null> {
    return this.repo.getEventoById(tenantId, id)
  }
}
