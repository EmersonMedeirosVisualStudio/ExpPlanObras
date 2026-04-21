import type { ReactNode } from 'react';
import { requireAuthenticatedUser } from '@/lib/auth/require-authenticated-user';
import { AppHeader } from '@/components/layout/AppHeader';
import { SidebarNav } from '@/components/layout/SidebarNav';
import { getCurrentUserPermissions } from '@/lib/auth/get-current-user-permissions';
import { getDashboardScope } from '@/lib/dashboard/scope';
import { buildMenuResponse, type BuildMenuContext } from '@/lib/navigation/build';
import type { MenuScopeType } from '@/lib/navigation/types';
import { buildMenuBadges } from '@/lib/navigation/build-menu-badges';
import type { MenuItemDTO } from '@/lib/navigation/types';
import RealtimeProvider from '@/components/realtime/RealtimeProvider';
import { REALTIME_TOPICS } from '@/lib/realtime/topics';

function collectKeys(items: MenuItemDTO[], out: Set<string>) {
  for (const it of items) {
    out.add(it.key);
    if (it.children?.length) collectKeys(it.children, out);
  }
}

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const user = await requireAuthenticatedUser();
  const permissions = await getCurrentUserPermissions(user.id);
  const scope = await getDashboardScope(user);
  const scopeTypes = [
    scope.empresaTotal ? 'EMPRESA' : null,
    ...(scope.diretorias?.length ? ['DIRETORIA'] : []),
    ...(scope.obras?.length ? ['OBRA'] : []),
    ...(scope.unidades?.length ? ['UNIDADE'] : []),
  ].filter(Boolean) as MenuScopeType[];
  const ctx: BuildMenuContext = { permissions, scopeTypes };
  const menu = buildMenuResponse(ctx);
  const allowedKeys = new Set<string>();
  for (const secao of menu.secoes) collectKeys(secao.items, allowedKeys);
  const initialBadges = await buildMenuBadges(
    {
      tenantId: user.tenantId,
      userId: user.id,
      permissions,
      scope: {
        empresaTotal: !!scope.empresaTotal,
        diretorias: scope.diretorias ?? [],
        obras: scope.obras ?? [],
        unidades: scope.unidades ?? [],
      },
    },
    allowedKeys
  );

  const permSet = new Set(permissions);
  const topics: string[] = [REALTIME_TOPICS.MENU, REALTIME_TOPICS.NOTIFICATIONS];
  if (permSet.has('rh.funcionarios.view') || permSet.has('dashboard.rh.view')) topics.push(REALTIME_TOPICS.DASHBOARD_RH);
  if (permSet.has('sst.painel.view')) topics.push(REALTIME_TOPICS.DASHBOARD_SST);
  if (permSet.has('dashboard.suprimentos.view')) topics.push(REALTIME_TOPICS.DASHBOARD_SUPRIMENTOS);
  if (permSet.has('dashboard.engenharia.view')) topics.push(REALTIME_TOPICS.DASHBOARD_ENGENHARIA);
  if (permSet.has('dashboard.gerente.view')) topics.push(REALTIME_TOPICS.DASHBOARD_GERENTE);
  if (permSet.has('dashboard.diretor.view')) topics.push(REALTIME_TOPICS.DASHBOARD_DIRETOR);
  if (permSet.has('dashboard.ceo.view')) topics.push(REALTIME_TOPICS.DASHBOARD_CEO);
  if (permSet.has('admin.backup.view')) topics.push(REALTIME_TOPICS.BACKUP);
  if (permSet.has('relatorios.agendados.view')) topics.push(REALTIME_TOPICS.RELATORIOS);

  return (
    <div className="flex min-h-screen bg-[#f7f8fa]">
      <RealtimeProvider topics={topics}>
        <SidebarNav secoes={menu.secoes} initialBadges={initialBadges} />
        <div className="flex-1 min-w-0">
          <AppHeader user={user} />
          <main className="p-6">{children}</main>
        </div>
      </RealtimeProvider>
    </div>
  );
}
