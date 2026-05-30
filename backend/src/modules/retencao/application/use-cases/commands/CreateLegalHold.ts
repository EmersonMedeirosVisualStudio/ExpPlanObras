import type { IRetencaoRepository, CreateLegalHoldInput } from '@/modules/retencao/domain/ports/IRetencaoRepository.js'

export class CreateLegalHoldUseCase {
  constructor(private readonly repo: IRetencaoRepository) {}

  async execute(tenantId: number, input: CreateLegalHoldInput) {
    return this.repo.createLegalHold(tenantId, input)
  }
}
