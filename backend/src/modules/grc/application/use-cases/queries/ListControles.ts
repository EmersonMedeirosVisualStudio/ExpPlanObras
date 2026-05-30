import type { IGrcRepository, GrcControleWhere } from '@/modules/grc/domain/ports/IGrcRepository.js'

export interface ListControlesInput {
  tenantId: number
  ativo?: string
  pagina: number
  limite: number
}

export class ListControles {
  constructor(private readonly repo: IGrcRepository) {}

  async execute(input: ListControlesInput) {
    const where: GrcControleWhere = { tenantId: input.tenantId }
    if (input.ativo !== undefined) where.ativo = input.ativo.toLowerCase() === 'true'
    const skip = (input.pagina - 1) * input.limite
    const [rows, total] = await Promise.all([
      this.repo.findManyControles(where, { skip, take: input.limite }),
      this.repo.countControles(where),
    ])
    return { rows, total }
  }
}
