import { requirePermission } from '@/lib/auth/access';
import { PERMISSIONS } from '@/lib/auth/permissions';
import PresencasClient from './PresencasClient';

export default async function PresencasPage() {
  await requirePermission(PERMISSIONS.RH_PRESENCAS_VIEW);
  return <PresencasClient />;
}

