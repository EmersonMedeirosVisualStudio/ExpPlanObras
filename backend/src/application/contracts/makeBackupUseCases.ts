import { PrismaBackupRepository } from '@/infra/database/repositories/PrismaBackupRepository.js'
import { ExportBackup } from '@/application/use-cases/backup/commands/ExportBackup.js'
import { RestoreBackup } from '@/application/use-cases/backup/commands/RestoreBackup.js'

export function makeBackupUseCases() {
  const repo = new PrismaBackupRepository()
  return {
    export: new ExportBackup(repo),
    restore: new RestoreBackup(repo),
  }
}
