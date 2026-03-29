import { requirePermission } from '@/lib/auth/access';
import { PERMISSIONS } from '@/lib/auth/permissions';
import RiscosClient from './RiscosClient';

export default async function Page() {
  await requirePermission(PERMISSIONS.GRC_RISCOS_VIEW);
  return <RiscosClient />;
}
