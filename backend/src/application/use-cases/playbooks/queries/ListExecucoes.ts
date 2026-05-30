import type { IPlaybooksRepository, ListExecucoesFilter } from '@/domain/repositories/IPlaybooksRepository.js'

export interface ListExecucoesInput {
  tenantId: number
  status?: string
  pagina?: number
  limite?: number
}

export interface ListExecucoesOutput {
  rows: unknown[]
  total: number
  pagina: number
  limite: number
}

export class ListExecucoesUseCase {
  constructor(private readonly repo: IPlaybooksRepository) {}

  async execute(input: ListExecucoesInput): Promise<ListExecucoesOutput> {
    const filter: ListExecucoesFilter = {
      status: input.status,
      pagina: input.pagina ?? 1,
      limite: input.limite ?? 30,
    }
    const [rows, total] = await Promise.all([
      this.repo.listExecucoes(input.tenantId, filter),
      this.repo.countExecucoes(input.tenantId, filter),
    ])
    return { rows, total, pagina: filter.pagina!, limite: filter.limite! }
  }
}
