import { requirePermission } from '@/lib/auth/access';
import { PERMISSIONS } from '@/lib/auth/permissions';
import DashboardCeoClient from './DashboardCeoClient';

export default async function Page() {
  await requirePermission(PERMISSIONS.DASHBOARD_CEO_VIEW);
  return <DashboardCeoClient />;
}

