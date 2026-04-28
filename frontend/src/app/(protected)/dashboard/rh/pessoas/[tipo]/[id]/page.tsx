import { requirePermission } from '@/lib/auth/access';
import { PERMISSIONS } from '@/lib/auth/permissions';
import FichaRhClient from './FichaRhClient';

export default async function Page() {
  await requirePermission(PERMISSIONS.RH_FUNCIONARIOS_VIEW);
  return <FichaRhClient />;
}

