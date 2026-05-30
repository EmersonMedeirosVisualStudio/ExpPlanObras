import type { IBackupRepository } from '@/modules/backup/domain/ports/IBackupRepository.js'

export class ExportBackup {
  constructor(private readonly repo: IBackupRepository) {}

  execute(tenantId: number) {
    return this.repo.export(tenantId)
  }
}
