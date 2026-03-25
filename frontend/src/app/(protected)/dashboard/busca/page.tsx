import { requirePermission } from '@/lib/auth/access';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { GlobalSearchTrigger } from '@/components/search/GlobalSearchTrigger';

export default async function Page() {
  await requirePermission(PERMISSIONS.BUSCA_GLOBAL_VIEW);
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Busca</h1>
      <div className="text-sm text-slate-600">Use Ctrl+K para abrir a busca global em qualquer tela.</div>
      <div>
        <GlobalSearchTrigger />
      </div>
    </div>
  );
}

