import { PrismaBackupRepository } from '@/modules/backup/infrastructure/persistence/PrismaBackupRepository.js'
import { ExportBackup } from '@/modules/backup/application/use-cases/commands/ExportBackup.js'
import { RestoreBackup } from '@/modules/backup/application/use-cases/commands/RestoreBackup.js'

export function makeBackupUseCases() {
  const repo = new PrismaBackupRepository()
  return {
    export: new ExportBackup(repo),
    restore: new RestoreBackup(repo),
  }
}
