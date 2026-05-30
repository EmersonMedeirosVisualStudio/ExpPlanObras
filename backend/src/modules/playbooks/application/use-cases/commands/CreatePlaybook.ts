import type { IPlaybooksRepository, CreatePlaybookInput } from '@/modules/playbooks/domain/ports/IPlaybooksRepository.js'

export interface CreatePlaybookUseCaseInput extends CreatePlaybookInput {
  tenantId: number
}

export class CreatePlaybookUseCase {
  constructor(private readonly repo: IPlaybooksRepository) {}

  async execute(input: CreatePlaybookUseCaseInput): Promise<{ id: number }> {
    const { tenantId, ...rest } = input
    const pb = (await this.repo.createPlaybook(tenantId, rest)) as { id: number }
    return { id: pb.id }
  }
}
