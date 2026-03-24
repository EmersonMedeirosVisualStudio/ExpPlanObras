import { redirect } from 'next/navigation';
import { requirePermission } from '@/lib/auth/access';
import { PERMISSIONS } from '@/lib/auth/permissions';
import DashboardExecutivoClient from './DashboardExecutivoClient';
import { getCurrentUser } from '@/lib/auth/current-user';
import { getCurrentUserPermissions } from '@/lib/auth/get-current-user-permissions';
import { getDashboardScope } from '@/lib/dashboard/scope';
import { resolveHomeHref, type BuildMenuContext } from '@/lib/navigation/build';
import type { MenuScopeType } from '@/lib/navigation/types';

export default async function DashboardCeoPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const permissions = await getCurrentUserPermissions(user.id);
  const scope = await getDashboardScope(user);
  const scopeTypes = [
    scope.empresaTotal ? 'EMPRESA' : null,
    ...(scope.diretorias?.length ? ['DIRETORIA'] : []),
    ...(scope.obras?.length ? ['OBRA'] : []),
    ...(scope.unidades?.length ? ['UNIDADE'] : []),
  ].filter(Boolean) as MenuScopeType[];
  const ctx: BuildMenuContext = { permissions, scopeTypes };
  const homeHref = resolveHomeHref(ctx);
  if (homeHref === '/dashboard') {
    await requirePermission(PERMISSIONS.DASHBOARD_EXECUTIVO_VIEW);
    return <DashboardExecutivoClient />;
  }

  redirect(homeHref);
}
