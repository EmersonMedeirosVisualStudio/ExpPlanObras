import { requirePermission } from '@/lib/auth/access';
import { PERMISSIONS } from '@/lib/auth/permissions';
import AchadosClient from './AchadosClient';

export default async function Page() {
  await requirePermission(PERMISSIONS.GRC_ACHADOS_VIEW);
  return <AchadosClient />;
}
