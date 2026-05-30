import type { IGrcRepository, GrcAchadoWhere } from '@/domain/repositories/IGrcRepository.js'

export interface ListAchadosInput {
  tenantId: number
  status?: string
  gravidade?: string
  pagina: number
  limite: number
}

export class ListAchados {
  constructor(private readonly repo: IGrcRepository) {}

  async execute(input: ListAchadosInput) {
    const where: GrcAchadoWhere = { tenantId: input.tenantId }
    if (input.status) where.statusAchado = input.status.toUpperCase()
    if (input.gravidade) where.gravidade = input.gravidade.toUpperCase()
    const skip = (input.pagina - 1) * input.limite
    const [rows, total] = await Promise.all([
      this.repo.findManyAchados(where, { skip, take: input.limite }),
      this.repo.countAchados(where),
    ])
    return { rows, total }
  }
}
