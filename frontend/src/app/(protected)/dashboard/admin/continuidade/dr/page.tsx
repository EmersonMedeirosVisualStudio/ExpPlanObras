import { requirePermission } from '@/lib/auth/access';
import { PERMISSIONS } from '@/lib/auth/permissions';
import DrClient from './DrClient';

export default async function Page() {
  await requirePermission(PERMISSIONS.DR_VIEW);
  return <DrClient />;
}
