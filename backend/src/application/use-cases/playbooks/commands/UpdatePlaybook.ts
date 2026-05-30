import type { IPlaybooksRepository, UpdatePlaybookInput } from '@/domain/repositories/IPlaybooksRepository.js'
import { PlaybookNotFoundError } from '@/domain/errors/PlaybooksErrors.js'

export interface UpdatePlaybookUseCaseInput extends UpdatePlaybookInput {
  tenantId: number
  id: number
}

export class UpdatePlaybookUseCase {
  constructor(private readonly repo: IPlaybooksRepository) {}

  async execute(input: UpdatePlaybookUseCaseInput): Promise<void> {
    const existing = await this.repo.getPlaybookById(input.tenantId, input.id)
    if (!existing) throw new PlaybookNotFoundError(input.id)
    const { tenantId, id, ...rest } = input
    await this.repo.updatePlaybook(tenantId, id, rest)
  }
}
