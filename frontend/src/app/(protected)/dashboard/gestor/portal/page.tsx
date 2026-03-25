import { requirePermission } from '@/lib/auth/access';
import { PERMISSIONS } from '@/lib/auth/permissions';
import PortalGestorClient from './PortalGestorClient';

export default async function Page() {
  await requirePermission(PERMISSIONS.PORTAL_GESTOR_VIEW);
  return <PortalGestorClient />;
}

