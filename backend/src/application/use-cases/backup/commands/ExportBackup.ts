import type { IBackupRepository } from '@/domain/repositories/IBackupRepository.js'

export class ExportBackup {
  constructor(private readonly repo: IBackupRepository) {}

  execute(tenantId: number) {
    return this.repo.export(tenantId)
  }
}
