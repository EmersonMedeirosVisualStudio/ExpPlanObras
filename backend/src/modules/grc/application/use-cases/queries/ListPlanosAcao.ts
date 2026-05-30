import type { IGrcRepository, GrcPlanoAcaoWhere } from '@/modules/grc/domain/ports/IGrcRepository.js'

export interface ListPlanosAcaoInput {
  tenantId: number
  status?: string
  pagina: number
  limite: number
}

export class ListPlanosAcao {
  constructor(private readonly repo: IGrcRepository) {}

  async execute(input: ListPlanosAcaoInput) {
    const where: GrcPlanoAcaoWhere = { tenantId: input.tenantId }
    if (input.status) where.statusPlano = input.status.toUpperCase()
    const skip = (input.pagina - 1) * input.limite
    const [rows, total] = await Promise.all([
      this.repo.findManyPlanosAcao(where, { skip, take: input.limite }),
      this.repo.countPlanosAcao(where),
    ])
    return { rows, total }
  }
}
