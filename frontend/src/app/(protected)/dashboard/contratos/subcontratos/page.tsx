import { requirePermission } from "@/lib/auth/require-permission";
import { PERMISSIONS } from "@/lib/auth/permissions";

export default async function SubcontratosPage() {
  await requirePermission(PERMISSIONS.DASHBOARD_ENGENHARIA_VIEW);
  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-semibold">Subcontratos</h1>
      <div className="rounded-xl border bg-white p-4 shadow-sm text-sm text-slate-600">
        Esta seção será a gestão de terceirização (subcontratos) vinculada a contratos e obras, com impacto direto no custo e na margem.
      </div>
    </div>
  );
}

