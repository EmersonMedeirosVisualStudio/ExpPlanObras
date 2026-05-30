import type { IContinuidadeRepository } from '@/domain/repositories/IContinuidadeRepository.js'

export interface ListCrisesQuery {
  status?: string
  pagina?: number
  limite?: number
}

export class ListCrisesUseCase {
  constructor(private readonly repo: IContinuidadeRepository) {}

  async execute(tenantId: number, query: ListCrisesQuery) {
    return this.repo.listCrises(tenantId, {
      status: query.status ? String(query.status).toUpperCase() : undefined,
      pagina: query.pagina,
      limite: query.limite,
    })
  }
}
