import { requirePermission } from '@/lib/auth/access';
import { PERMISSIONS } from '@/lib/auth/permissions';
import ConfiguracaoEmpresaClient from '../ConfiguracaoEmpresaClient';

export default async function EncarregadoSistemaPage() {
  await requirePermission(PERMISSIONS.ENCARREGADO_SISTEMA_VIEW);

  return <ConfiguracaoEmpresaClient modo="ENCARREGADO" />;
}
