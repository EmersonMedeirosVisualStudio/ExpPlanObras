import type { IRetencaoRepository } from '@/modules/retencao/domain/ports/IRetencaoRepository.js'
import { PoliticaNotFoundError } from '@/modules/retencao/domain/errors/RetencaoErrors.js'

export class GetPoliticaByIdUseCase {
  constructor(private readonly repo: IRetencaoRepository) {}

  async execute(tenantId: number, id: number) {
    const politica = await this.repo.getPoliticaById(tenantId, id)
    if (!politica) throw new PoliticaNotFoundError(id)
    return politica
  }
}
