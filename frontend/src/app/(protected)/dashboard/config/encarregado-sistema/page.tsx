import { requirePermission } from '@/lib/auth/access';
import { PERMISSIONS } from '@/lib/auth/permissions';
import ConfiguracaoEmpresaClient from '../ConfiguracaoEmpresaClient';

export default async function EncarregadoSistemaPage() {
  await requirePermission(PERMISSIONS.REPRESENTANTE_VIEW);

  return <ConfiguracaoEmpresaClient abaInicial="encarregado" />;
}
