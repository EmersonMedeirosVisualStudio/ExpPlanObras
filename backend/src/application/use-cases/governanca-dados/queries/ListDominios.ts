import type { IGovernancaDadosRepository } from '@/domain/repositories/IGovernancaDadosRepository.js'

export class ListDominiosUseCase {
  constructor(private readonly repo: IGovernancaDadosRepository) {}

  async execute(tenantId: number) {
    return this.repo.listDominios(tenantId)
  }
}
