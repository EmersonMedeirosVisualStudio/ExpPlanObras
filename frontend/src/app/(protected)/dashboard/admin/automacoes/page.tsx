import { requirePermission } from '@/lib/auth/access';
import { PERMISSIONS } from '@/lib/auth/permissions';
import AutomacoesClient from './AutomacoesClient';

export default async function Page() {
  await requirePermission(PERMISSIONS.AUTOMACOES_VIEW);
  return <AutomacoesClient />;
}

