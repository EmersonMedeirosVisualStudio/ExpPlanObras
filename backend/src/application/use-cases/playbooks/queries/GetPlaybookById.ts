import type { IPlaybooksRepository } from '@/domain/repositories/IPlaybooksRepository.js'
import { PlaybookNotFoundError } from '@/domain/errors/PlaybooksErrors.js'

export interface GetPlaybookByIdInput {
  tenantId: number
  id: number
}

export class GetPlaybookByIdUseCase {
  constructor(private readonly repo: IPlaybooksRepository) {}

  async execute(input: GetPlaybookByIdInput): Promise<unknown> {
    const pb = await this.repo.getPlaybookById(input.tenantId, input.id)
    if (!pb) throw new PlaybookNotFoundError(input.id)
    return pb
  }
}
