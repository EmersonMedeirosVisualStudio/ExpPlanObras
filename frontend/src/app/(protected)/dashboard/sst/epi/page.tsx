import { requirePermission } from '@/lib/auth/access';
import { PERMISSIONS } from '@/lib/auth/permissions';
import EpiClient from './EpiClient';

export default async function Page() {
  await requirePermission(PERMISSIONS.SST_EPI_VIEW);
  return <EpiClient />;
}

