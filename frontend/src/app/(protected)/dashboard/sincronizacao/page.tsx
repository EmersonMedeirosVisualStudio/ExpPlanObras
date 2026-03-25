import { requirePermission } from '@/lib/auth/access';
import { PERMISSIONS } from '@/lib/auth/permissions';
import SyncCenterClient from './SyncCenterClient';

export default async function Page() {
  await requirePermission(PERMISSIONS.DASHBOARD_VIEW);
  return <SyncCenterClient />;
}

