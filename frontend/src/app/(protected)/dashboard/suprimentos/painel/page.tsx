import { requirePermission } from '@/lib/auth/access';
import { PERMISSIONS } from '@/lib/auth/permissions';
import DashboardSuprimentosClient from './DashboardSuprimentosClient';

export default async function Page() {
  await requirePermission(PERMISSIONS.DASHBOARD_SUPRIMENTOS_VIEW);
  return <DashboardSuprimentosClient />;
}

