import { requirePermission } from '@/lib/auth/access';
import { PERMISSIONS } from '@/lib/auth/permissions';
import SstTreinamentosClient from './SstTreinamentosClient';

export default async function Page() {
  await requirePermission(PERMISSIONS.SST_TREINAMENTOS_VIEW);
  return <SstTreinamentosClient />;
}

