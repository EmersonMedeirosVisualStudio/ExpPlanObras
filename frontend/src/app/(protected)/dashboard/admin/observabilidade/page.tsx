import { requirePermission } from '@/lib/auth/access';
import { PERMISSIONS } from '@/lib/auth/permissions';
import ObservabilidadeClient from './ObservabilidadeClient';

export default async function Page() {
  await requirePermission(PERMISSIONS.OBSERVABILIDADE_VIEW);
  return <ObservabilidadeClient />;
}
