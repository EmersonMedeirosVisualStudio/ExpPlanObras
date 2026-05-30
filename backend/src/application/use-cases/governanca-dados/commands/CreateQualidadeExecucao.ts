import type { IGovernancaDadosRepository, CreateQualidadeExecucaoInput } from '@/domain/repositories/IGovernancaDadosRepository.js'

export class CreateQualidadeExecucaoUseCase {
  constructor(private readonly repo: IGovernancaDadosRepository) {}

  async execute(input: CreateQualidadeExecucaoInput) {
    return this.repo.createQualidadeExecucao(input)
  }
}
