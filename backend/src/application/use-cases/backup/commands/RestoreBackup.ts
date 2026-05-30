import type { IBackupRepository } from '@/domain/repositories/IBackupRepository.js'

export class RestoreBackup {
  constructor(private readonly repo: IBackupRepository) {}

  execute(tenantId: number, backup: unknown) {
    return this.repo.restore(tenantId, backup)
  }
}
