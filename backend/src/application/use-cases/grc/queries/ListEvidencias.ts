import type { IGrcRepository, GrcEvidenciaWhere } from '@/domain/repositories/IGrcRepository.js'

export interface ListEvidenciasInput {
  tenantId: number
  referenciaTipo?: string
  referenciaId?: number
  pagina: number
  limite: number
}

export class ListEvidencias {
  constructor(private readonly repo: IGrcRepository) {}

  async execute(input: ListEvidenciasInput) {
    const where: GrcEvidenciaWhere = { tenantId: input.tenantId }
    if (input.referenciaTipo) where.referenciaTipo = input.referenciaTipo.toUpperCase()
    if (input.referenciaId) where.referenciaId = input.referenciaId
    const skip = (input.pagina - 1) * input.limite
    const [rows, total] = await Promise.all([
      this.repo.findManyEvidencias(where, { skip, take: input.limite }),
      this.repo.countEvidencias(where),
    ])
    return { rows, total }
  }
}
