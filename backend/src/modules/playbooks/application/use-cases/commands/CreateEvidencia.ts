import type { IPlaybooksRepository, CreateEvidenciaInput } from '@/modules/playbooks/domain/ports/IPlaybooksRepository.js'
import { CasoComplianceNotFoundError } from '@/modules/playbooks/domain/errors/PlaybooksErrors.js'

export interface CreateEvidenciaUseCaseInput extends CreateEvidenciaInput {
  tenantId: number
}

export class CreateEvidenciaUseCase {
  constructor(private readonly repo: IPlaybooksRepository) {}

  async execute(input: CreateEvidenciaUseCaseInput): Promise<{ id: number }> {
    const caso = await this.repo.getCasoComplianceById(input.tenantId, input.casoId)
    if (!caso) throw new CasoComplianceNotFoundError(input.casoId)

    const { tenantId, ...rest } = input
    const created = (await this.repo.createEvidencia(tenantId, rest)) as { id: number }
    return { id: created.id }
  }
}
