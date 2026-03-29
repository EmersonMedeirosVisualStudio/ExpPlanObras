import { requirePermission } from '@/lib/auth/access';
import { PERMISSIONS } from '@/lib/auth/permissions';
import GrcClient from './GrcClient';

export default async function Page() {
  await requirePermission(PERMISSIONS.GRC_VIEW);
  return <GrcClient />;
}
