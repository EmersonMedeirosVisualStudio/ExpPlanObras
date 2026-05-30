import type { IAdminRepository } from '@/modules/admin/domain/ports/IAdminRepository.js'

export class UploadTenantHistoryAttachment {
  constructor(private readonly repo: IAdminRepository) {}

  execute(
    tenantId: number,
    input: { message: string; files: Array<{ filename: string; mimetype: string; buffer: Buffer }> },
    actorUserId?: number | null,
  ) {
    return this.repo.uploadTenantHistoryAttachment(tenantId, input, actorUserId)
  }
}
