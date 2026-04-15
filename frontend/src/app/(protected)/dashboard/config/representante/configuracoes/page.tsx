import { requirePermission } from '@/lib/auth/access';
import { PERMISSIONS } from '@/lib/auth/permissions';
import ConfiguracaoEmpresaClient from '../../ConfiguracaoEmpresaClient';

export default async function RepresentanteConfiguracoesPage() {
  await requirePermission(PERMISSIONS.REPRESENTANTE_VIEW);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-slate-900">Painel do Representante</h1>
      <ConfiguracaoEmpresaClient modo="REPRESENTANTE" />
    </div>
  );
}

