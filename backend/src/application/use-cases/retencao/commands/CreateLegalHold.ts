import type { IRetencaoRepository, CreateLegalHoldInput } from '@/domain/repositories/IRetencaoRepository.js'

export class CreateLegalHoldUseCase {
  constructor(private readonly repo: IRetencaoRepository) {}

  async execute(tenantId: number, input: CreateLegalHoldInput) {
    return this.repo.createLegalHold(tenantId, input)
  }
}
