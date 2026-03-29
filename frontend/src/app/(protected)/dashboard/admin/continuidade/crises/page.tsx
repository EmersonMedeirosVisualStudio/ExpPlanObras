import { requirePermission } from '@/lib/auth/access';
import { PERMISSIONS } from '@/lib/auth/permissions';
import CrisesClient from './CrisesClient';

export default async function Page() {
  await requirePermission(PERMISSIONS.CRISE_VIEW);
  return <CrisesClient />;
}
