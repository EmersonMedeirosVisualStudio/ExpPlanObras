import { requirePermission } from '@/lib/auth/access';
import { PERMISSIONS } from '@/lib/auth/permissions';
import SstAcidentesClient from './SstAcidentesClient';

export default async function Page() {
  await requirePermission(PERMISSIONS.SST_ACIDENTES_VIEW);
  return <SstAcidentesClient />;
}
