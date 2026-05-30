import type { IRetencaoRepository, UpdatePoliticaInput } from '@/modules/retencao/domain/ports/IRetencaoRepository.js'
import { PoliticaNotFoundError } from '@/modules/retencao/domain/errors/RetencaoErrors.js'

export class UpdatePoliticaUseCase {
  constructor(private readonly repo: IRetencaoRepository) {}

  async execute(tenantId: number, id: number, input: UpdatePoliticaInput) {
    const existing = await this.repo.getPoliticaById(tenantId, id)
    if (!existing) throw new PoliticaNotFoundError(id)
    return this.repo.updatePolitica(tenantId, id, input)
  }
}
