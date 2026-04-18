import { requirePermission } from '@/lib/auth/access';
import { PERMISSIONS } from '@/lib/auth/permissions';
import ServicosExecucaoAprovacaoClient from './ServicosExecucaoAprovacaoClient';

export default async function Page() {
  await requirePermission(PERMISSIONS.DASHBOARD_FISCALIZACAO_VIEW);
  return <ServicosExecucaoAprovacaoClient />;
}

