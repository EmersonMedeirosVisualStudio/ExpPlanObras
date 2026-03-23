import { requirePermission } from '@/lib/auth/access';
import { PERMISSIONS } from '@/lib/auth/permissions';
import ConfiguracaoEmpresaClient from '../ConfiguracaoEmpresaClient';

export default async function RepresentantePage() {
  await requirePermission(PERMISSIONS.REPRESENTANTE_VIEW);

  return <ConfiguracaoEmpresaClient abaInicial="representante" />;
}
