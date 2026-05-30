import type { IRetencaoRepository, UpdatePoliticaInput } from '@/domain/repositories/IRetencaoRepository.js'
import { PoliticaNotFoundError } from '@/domain/errors/RetencaoErrors.js'

export class UpdatePoliticaUseCase {
  constructor(private readonly repo: IRetencaoRepository) {}

  async execute(tenantId: number, id: number, input: UpdatePoliticaInput) {
    const existing = await this.repo.getPoliticaById(tenantId, id)
    if (!existing) throw new PoliticaNotFoundError(id)
    return this.repo.updatePolitica(tenantId, id, input)
  }
}
