import { requirePermission } from '@/lib/auth/access';
import { PERMISSIONS } from '@/lib/auth/permissions';
import AprovacoesModelosClient from './AprovacoesModelosClient';

export default async function Page() {
  await requirePermission(PERMISSIONS.APROVACOES_MODELOS_VIEW);
  return <AprovacoesModelosClient />;
}

