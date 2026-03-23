import { requirePermission } from '@/lib/auth/access';
import { PERMISSIONS } from '@/lib/auth/permissions';
import DashboardGerenteClient from './DashboardGerenteClient';

export default async function Page() {
  await requirePermission(PERMISSIONS.DASHBOARD_GERENTE_VIEW);
  return <DashboardGerenteClient />;
}

