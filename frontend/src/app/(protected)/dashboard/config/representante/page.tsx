import { requirePermission } from '@/lib/auth/access';
import { PERMISSIONS } from '@/lib/auth/permissions';
import PainelRepresentanteClient from './PainelRepresentanteClient';

export default async function RepresentantePage() {
  await requirePermission(PERMISSIONS.REPRESENTANTE_VIEW);

  return <PainelRepresentanteClient />;
}
