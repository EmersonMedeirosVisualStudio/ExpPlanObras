import { requirePermission } from '@/lib/auth/access';
import { PERMISSIONS } from '@/lib/auth/permissions';
import GovernancaClient from './GovernancaClient';

export default async function GovernancaPage() {
  await requirePermission(PERMISSIONS.GOVERNANCA_VIEW);

  return <GovernancaClient />;
}
