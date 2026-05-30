import type { IBackupRepository } from '@/modules/backup/domain/ports/IBackupRepository.js'

export class RestoreBackup {
  constructor(private readonly repo: IBackupRepository) {}

  execute(tenantId: number, backup: unknown) {
    return this.repo.restore(tenantId, backup)
  }
}
