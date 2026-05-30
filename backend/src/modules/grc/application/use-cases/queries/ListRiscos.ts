import type { IGrcRepository, GrcRiscoWhere } from '@/modules/grc/domain/ports/IGrcRepository.js'

export interface ListRiscosInput {
  tenantId: number
  status?: string
  categoria?: string
  pagina: number
  limite: number
}

export class ListRiscos {
  constructor(private readonly repo: IGrcRepository) {}

  async execute(input: ListRiscosInput) {
    const where: GrcRiscoWhere = { tenantId: input.tenantId }
    if (input.status) where.statusRisco = input.status.toUpperCase()
    if (input.categoria) where.categoriaRisco = input.categoria.toUpperCase()
    const skip = (input.pagina - 1) * input.limite
    const [rows, total] = await Promise.all([
      this.repo.findManyRiscos(where, { skip, take: input.limite }),
      this.repo.countRiscos(where),
    ])
    return { rows, total }
  }
}
