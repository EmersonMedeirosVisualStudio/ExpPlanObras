import { requirePermission } from '@/lib/auth/access';
import { PERMISSIONS } from '@/lib/auth/permissions';
import OrganogramaClient from './OrganogramaClient';

export default async function OrganogramaPage() {
  await requirePermission(PERMISSIONS.ORGANOGRAMA_VIEW);
  return <OrganogramaClient />;
}
