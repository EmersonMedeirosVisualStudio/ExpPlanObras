import { requirePermission } from '@/lib/auth/access';
import { PERMISSIONS } from '@/lib/auth/permissions';
import ProdutividadeClient from './ProdutividadeClient';

export default async function Page() {
  await requirePermission(PERMISSIONS.DASHBOARD_RH_VIEW);
  return <ProdutividadeClient />;
}
