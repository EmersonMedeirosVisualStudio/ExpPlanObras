import { requirePermission } from '@/lib/auth/access';
import { PERMISSIONS } from '@/lib/auth/permissions';
import AlocacaoClient from './AlocacaoClient';

export default async function RhAlocacaoPage() {
  await requirePermission(PERMISSIONS.RH_FUNCIONARIOS_VIEW);
  return <AlocacaoClient />;
}
