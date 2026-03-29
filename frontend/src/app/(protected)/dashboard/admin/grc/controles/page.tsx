import { requirePermission } from '@/lib/auth/access';
import { PERMISSIONS } from '@/lib/auth/permissions';
import ControlesClient from './ControlesClient';

export default async function Page() {
  await requirePermission(PERMISSIONS.GRC_CONTROLES_VIEW);
  return <ControlesClient />;
}
