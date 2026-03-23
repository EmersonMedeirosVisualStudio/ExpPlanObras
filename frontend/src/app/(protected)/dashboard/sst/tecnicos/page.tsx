import { requirePermission } from '@/lib/auth/access';
import { PERMISSIONS } from '@/lib/auth/permissions';
import SstTecnicosClient from './SstTecnicosClient';

export default async function Page() {
  await requirePermission(PERMISSIONS.SST_TECNICOS_VIEW);
  return <SstTecnicosClient />;
}
