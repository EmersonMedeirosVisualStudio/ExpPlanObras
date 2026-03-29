import { requirePermission } from '@/lib/auth/access';
import { PERMISSIONS } from '@/lib/auth/permissions';
import RetencaoClient from './RetencaoClient';

export default async function Page() {
  await requirePermission(PERMISSIONS.RETENCAO_VIEW);
  return <RetencaoClient />;
}

