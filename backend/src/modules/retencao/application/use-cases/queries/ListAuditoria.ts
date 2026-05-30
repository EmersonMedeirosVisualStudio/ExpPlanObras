import type { IRetencaoRepository, ListAuditoriaFilter } from '@/modules/retencao/domain/ports/IRetencaoRepository.js'

export class ListAuditoriaUseCase {
  constructor(private readonly repo: IRetencaoRepository) {}

  async execute(tenantId: number, filter: ListAuditoriaFilter) {
    return this.repo.listAuditoria(tenantId, filter)
  }
}
