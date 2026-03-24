import { requirePermission } from '@/lib/auth/access';
import { PERMISSIONS } from '@/lib/auth/permissions';
import RelatoriosAgendadosClient from './RelatoriosAgendadosClient';

export default async function Page() {
  await requirePermission(PERMISSIONS.RELATORIOS_AGENDADOS_VIEW);
  return <RelatoriosAgendadosClient />;
}

