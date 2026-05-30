import type { IAdminRepository } from '@/domain/repositories/IAdminRepository.js'

export class GetHistoryAttachment {
  constructor(private readonly repo: IAdminRepository) {}

  execute(attachmentId: number) {
    return this.repo.getHistoryAttachment(attachmentId)
  }
}
