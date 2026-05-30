import type { IContinuidadeRepository } from '@/modules/continuidade/domain/ports/IContinuidadeRepository.js'

export interface ListDrExecucoesQuery {
  status?: string
  pagina?: number
  limite?: number
}

export class ListDrExecucoesUseCase {
  constructor(private readonly repo: IContinuidadeRepository) {}

  async execute(tenantId: number, query: ListDrExecucoesQuery) {
    return this.repo.listDrExecucoes(tenantId, {
      status: query.status ? String(query.status).toUpperCase() : undefined,
      pagina: query.pagina,
      limite: query.limite,
    })
  }
}
