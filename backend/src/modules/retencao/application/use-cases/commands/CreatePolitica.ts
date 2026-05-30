import type { IRetencaoRepository, CreatePoliticaInput } from '@/modules/retencao/domain/ports/IRetencaoRepository.js'

export class CreatePoliticaUseCase {
  constructor(private readonly repo: IRetencaoRepository) {}

  async execute(tenantId: number, input: CreatePoliticaInput) {
    return this.repo.createPolitica(tenantId, input)
  }
}
