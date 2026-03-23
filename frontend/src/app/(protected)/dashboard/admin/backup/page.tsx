import { requirePermission } from '@/lib/auth/access';
import { PERMISSIONS } from '@/lib/auth/permissions';
import BackupSegurancaClient from './BackupSegurancaClient';

export default async function BackupPage() {
  await requirePermission(PERMISSIONS.BACKUP_VIEW);

  return <BackupSegurancaClient />;
}
