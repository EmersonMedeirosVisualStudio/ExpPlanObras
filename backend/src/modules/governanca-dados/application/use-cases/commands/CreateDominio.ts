import type { IGovernancaDadosRepository, CreateDominioInput } from '@/modules/governanca-dados/domain/ports/IGovernancaDadosRepository.js'

export class CreateDominioUseCase {
  constructor(private readonly repo: IGovernancaDadosRepository) {}

  async execute(tenantId: number, input: CreateDominioInput) {
    return this.repo.createDominio(tenantId, input)
  }
}
