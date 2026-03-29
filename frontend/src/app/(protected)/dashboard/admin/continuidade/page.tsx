import { requirePermission } from '@/lib/auth/access';
import { PERMISSIONS } from '@/lib/auth/permissions';
import ContinuidadeClient from './ContinuidadeClient';

export default async function Page() {
  await requirePermission(PERMISSIONS.BCP_VIEW);
  return <ContinuidadeClient />;
}
