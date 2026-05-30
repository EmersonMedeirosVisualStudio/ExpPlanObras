import type { IPlaybooksRepository, CreateCasoComplianceInput } from '@/domain/repositories/IPlaybooksRepository.js'

export interface CreateCasoComplianceUseCaseInput extends CreateCasoComplianceInput {
  tenantId: number
}

export class CreateCasoComplianceUseCase {
  constructor(private readonly repo: IPlaybooksRepository) {}

  async execute(input: CreateCasoComplianceUseCaseInput): Promise<{ id: number }> {
    const { tenantId, ...rest } = input
    const created = (await this.repo.createCasoCompliance(tenantId, rest)) as { id: number }
    return { id: created.id }
  }
}
