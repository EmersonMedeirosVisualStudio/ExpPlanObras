import type { IBackupRepository } from '@/modules/backup/domain/ports/IBackupRepository.js'
import { exportTenantBackup, restoreTenantBackup } from '@/modules/backup/infrastructure/services/backupOps.js'

export class PrismaBackupRepository implements IBackupRepository {
  export(tenantId: number) {
    return exportTenantBackup(tenantId)
  }

  restore(tenantId: number, backup: unknown) {
    return restoreTenantBackup(tenantId, backup)
  }
}
