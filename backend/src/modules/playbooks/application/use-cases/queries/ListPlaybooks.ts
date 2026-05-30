import type { IPlaybooksRepository, ListPlaybooksFilter } from '@/modules/playbooks/domain/ports/IPlaybooksRepository.js'

export interface ListPlaybooksInput {
  tenantId: number
  ativo?: boolean
  pagina?: number
  limite?: number
}

export interface ListPlaybooksOutput {
  rows: unknown[]
  total: number
  pagina: number
  limite: number
}

export class ListPlaybooksUseCase {
  constructor(private readonly repo: IPlaybooksRepository) {}

  async execute(input: ListPlaybooksInput): Promise<ListPlaybooksOutput> {
    const filter: ListPlaybooksFilter = {
      ativo: input.ativo,
      pagina: input.pagina ?? 1,
      limite: input.limite ?? 30,
    }
    const [rows, total] = await Promise.all([
      this.repo.listPlaybooks(input.tenantId, filter),
      this.repo.countPlaybooks(input.tenantId, filter),
    ])
    return { rows, total, pagina: filter.pagina!, limite: filter.limite! }
  }
}
