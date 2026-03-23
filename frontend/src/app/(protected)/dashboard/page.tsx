import { requirePermission } from '@/lib/auth/access';
import { PERMISSIONS } from '@/lib/auth/permissions';
import DashboardExecutivoClient from './DashboardExecutivoClient';

export default async function DashboardCeoPage() {
  await requirePermission(PERMISSIONS.DASHBOARD_EXECUTIVO_VIEW);
  return <DashboardExecutivoClient />;
}
