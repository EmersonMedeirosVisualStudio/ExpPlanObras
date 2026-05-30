import type { IGovernancaDadosRepository, CreateDominioInput } from '@/domain/repositories/IGovernancaDadosRepository.js'

export class CreateDominioUseCase {
  constructor(private readonly repo: IGovernancaDadosRepository) {}

  async execute(tenantId: number, input: CreateDominioInput) {
    return this.repo.createDominio(tenantId, input)
  }
}
