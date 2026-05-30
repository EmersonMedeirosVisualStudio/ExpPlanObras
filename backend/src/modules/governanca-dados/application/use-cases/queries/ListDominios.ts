import type { IGovernancaDadosRepository } from '@/modules/governanca-dados/domain/ports/IGovernancaDadosRepository.js'

export class ListDominiosUseCase {
  constructor(private readonly repo: IGovernancaDadosRepository) {}

  async execute(tenantId: number) {
    return this.repo.listDominios(tenantId)
  }
}
