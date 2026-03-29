import { requirePermission } from '@/lib/auth/access';
import { PERMISSIONS } from '@/lib/auth/permissions';
import PlanosAcaoClient from './PlanosAcaoClient';

export default async function Page() {
  await requirePermission(PERMISSIONS.GRC_PLANOS_ACAO_VIEW);
  return <PlanosAcaoClient />;
}
