import { requirePermission } from '@/lib/auth/access';
import { PERMISSIONS } from '@/lib/auth/permissions';

export default async function RepresentanteDashboardPage() {
  await requirePermission(PERMISSIONS.REPRESENTANTE_VIEW);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold text-slate-900">Painel do Representante</h1>
      <div className="rounded-xl border bg-white p-6 text-sm text-slate-600">Em breve.</div>
    </div>
  );
}
