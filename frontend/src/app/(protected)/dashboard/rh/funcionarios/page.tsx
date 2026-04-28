import { requirePermission } from '@/lib/auth/access';
import { PERMISSIONS } from '@/lib/auth/permissions';
import FuncionariosClient from './FuncionariosClient';

export default async function FuncionariosPage() {
  await requirePermission(PERMISSIONS.RH_FUNCIONARIOS_VIEW);
  return <FuncionariosClient />;
}
