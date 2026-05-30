import type { IBackupRepository } from '@/domain/repositories/IBackupRepository.js'
import { exportTenantBackup, restoreTenantBackup } from '@/infra/providers/backup/backupOps.js'

export class PrismaBackupRepository implements IBackupRepository {
  export(tenantId: number) {
    return exportTenantBackup(tenantId)
  }

  restore(tenantId: number, backup: unknown) {
    return restoreTenantBackup(tenantId, backup)
  }
}
