import type { IRetencaoRepository } from '@/modules/retencao/domain/ports/IRetencaoRepository.js'
import { DescarteLoteNotFoundError } from '@/modules/retencao/domain/errors/RetencaoErrors.js'

export class GetDescarteLoteByIdUseCase {
  constructor(private readonly repo: IRetencaoRepository) {}

  async execute(tenantId: number, id: number) {
    const [lote, itens] = await Promise.all([
      this.repo.getDescarteLoteById(tenantId, id),
      this.repo.getDescarteLoteItens(tenantId, id),
    ])
    if (!lote) throw new DescarteLoteNotFoundError(id)
    return { lote, itens }
  }
}
