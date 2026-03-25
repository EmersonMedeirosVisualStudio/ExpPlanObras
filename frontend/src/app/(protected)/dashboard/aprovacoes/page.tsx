import { requirePermission } from '@/lib/auth/access';
import { PERMISSIONS } from '@/lib/auth/permissions';
import AprovacoesClient from './AprovacoesClient';

export default async function Page() {
  await requirePermission(PERMISSIONS.APROVACOES_VIEW);
  return <AprovacoesClient />;
}

