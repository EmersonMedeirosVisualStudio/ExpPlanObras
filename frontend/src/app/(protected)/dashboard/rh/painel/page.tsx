import { requirePermission } from '@/lib/auth/access';
import { PERMISSIONS } from '@/lib/auth/permissions';
import DashboardRhClient from './DashboardRhClient';

export default async function Page() {
  await requirePermission(PERMISSIONS.DASHBOARD_RH_VIEW);
  return <DashboardRhClient />;
}

