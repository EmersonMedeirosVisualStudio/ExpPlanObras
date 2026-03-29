import { requirePermission } from '@/lib/auth/access';
import { PERMISSIONS } from '@/lib/auth/permissions';
import FiscalizacaoClient from './FiscalizacaoClient';

export default async function Page() {
  await requirePermission(PERMISSIONS.DASHBOARD_FISCALIZACAO_VIEW);
  return <FiscalizacaoClient />;
}
