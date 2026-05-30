import type { IRetencaoRepository, ListAuditoriaFilter } from '@/domain/repositories/IRetencaoRepository.js'

export class ListAuditoriaUseCase {
  constructor(private readonly repo: IRetencaoRepository) {}

  async execute(tenantId: number, filter: ListAuditoriaFilter) {
    return this.repo.listAuditoria(tenantId, filter)
  }
}
