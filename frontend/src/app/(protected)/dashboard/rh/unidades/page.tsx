import { requirePermission } from '@/lib/auth/access';
import { PERMISSIONS } from '@/lib/auth/permissions';
import UnidadesClient from './UnidadesClient';

export default async function UnidadesPage() {
  await requirePermission(PERMISSIONS.RH_FUNCIONARIOS_VIEW);
  return <UnidadesClient />;
}

