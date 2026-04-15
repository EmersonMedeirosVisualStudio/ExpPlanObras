import { requirePermission } from '@/lib/auth/access';
import { PERMISSIONS } from '@/lib/auth/permissions';
import CadastrosClient from './CadastrosClient';

export default async function RhCadastrosPage() {
  await requirePermission(PERMISSIONS.RH_FUNCIONARIOS_VIEW);
  return <CadastrosClient />;
}

