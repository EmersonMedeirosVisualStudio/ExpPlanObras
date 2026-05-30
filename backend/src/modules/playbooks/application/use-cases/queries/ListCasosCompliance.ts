import type { IPlaybooksRepository, ListCasosComplianceFilter } from '@/modules/playbooks/domain/ports/IPlaybooksRepository.js'

export interface ListCasosComplianceInput {
  tenantId: number
  status?: string
  pagina?: number
  limite?: number
}

export interface ListCasosComplianceOutput {
  rows: unknown[]
  total: number
  pagina: number
  limite: number
}

export class ListCasosComplianceUseCase {
  constructor(private readonly repo: IPlaybooksRepository) {}

  async execute(input: ListCasosComplianceInput): Promise<ListCasosComplianceOutput> {
    const filter: ListCasosComplianceFilter = {
      status: input.status,
      pagina: input.pagina ?? 1,
      limite: input.limite ?? 30,
    }
    const [rows, total] = await Promise.all([
      this.repo.listCasosCompliance(input.tenantId, filter),
      this.repo.countCasosCompliance(input.tenantId, filter),
    ])
    return { rows, total, pagina: filter.pagina!, limite: filter.limite! }
  }
}
