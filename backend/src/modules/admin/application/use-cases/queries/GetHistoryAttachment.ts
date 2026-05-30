import type { IAdminRepository } from '@/modules/admin/domain/ports/IAdminRepository.js'

export class GetHistoryAttachment {
  constructor(private readonly repo: IAdminRepository) {}

  execute(attachmentId: number) {
    return this.repo.getHistoryAttachment(attachmentId)
  }
}
