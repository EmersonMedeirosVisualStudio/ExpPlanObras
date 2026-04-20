import { requirePermission } from "@/lib/auth/require-permission";
import { PERMISSIONS } from "@/lib/auth/permissions";

export default async function ContratosConfiguracoesPage() {
  await requirePermission(PERMISSIONS.DASHBOARD_ENGENHARIA_VIEW);
  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-semibold">Configurações</h1>
      <div className="rounded-xl border bg-white p-4 shadow-sm text-sm text-slate-600">
        Configurações do módulo de contratos (critérios de avanço, alertas, índices e integrações). Em evolução.
      </div>
    </div>
  );
}

