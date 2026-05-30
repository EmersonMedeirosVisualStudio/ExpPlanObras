import type { IRetencaoRepository, CreatePoliticaInput } from '@/domain/repositories/IRetencaoRepository.js'

export class CreatePoliticaUseCase {
  constructor(private readonly repo: IRetencaoRepository) {}

  async execute(tenantId: number, input: CreatePoliticaInput) {
    return this.repo.createPolitica(tenantId, input)
  }
}
