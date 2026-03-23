import { requirePermission } from '@/lib/auth/access';
import { PERMISSIONS } from '@/lib/auth/permissions';
import DashboardDiretorClient from './DashboardDiretorClient';

export default async function Page() {
  await requirePermission(PERMISSIONS.DASHBOARD_DIRETOR_VIEW);
  return <DashboardDiretorClient />;
}

