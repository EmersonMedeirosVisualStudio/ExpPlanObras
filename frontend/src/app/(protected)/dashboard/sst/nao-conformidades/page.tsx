import { requirePermission } from '@/lib/auth/access';
import { PERMISSIONS } from '@/lib/auth/permissions';
import SstNcClient from './SstNcClient';

export default async function Page() {
  await requirePermission(PERMISSIONS.SST_NC_VIEW);
  return <SstNcClient />;
}

