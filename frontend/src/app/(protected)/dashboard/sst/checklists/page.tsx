import { requirePermission } from '@/lib/auth/access';
import { PERMISSIONS } from '@/lib/auth/permissions';
import SstChecklistsClient from './SstChecklistsClient';

export default async function Page() {
  await requirePermission(PERMISSIONS.SST_CHECKLISTS_VIEW);
  return <SstChecklistsClient />;
}
