import type { IGrcRepository, GrcAuditoriaWhere } from '@/domain/repositories/IGrcRepository.js'

export interface ListAuditoriasInput {
  tenantId: number
  status?: string
  pagina: number
  limite: number
}

export class ListAuditorias {
  constructor(private readonly repo: IGrcRepository) {}

  async execute(input: ListAuditoriasInput) {
    const where: GrcAuditoriaWhere = { tenantId: input.tenantId }
    if (input.status) where.statusAuditoria = input.status.toUpperCase()
    const skip = (input.pagina - 1) * input.limite
    const [rows, total] = await Promise.all([
      this.repo.findManyAuditorias(where, { skip, take: input.limite }),
      this.repo.countAuditorias(where),
    ])
    return { rows, total }
  }
}
