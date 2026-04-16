import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/current-user';
import { getCurrentUserPermissions } from '@/lib/auth/get-current-user-permissions';
import { getDashboardScope } from '@/lib/dashboard/scope';
import { resolveHomeHref, type BuildMenuContext } from '@/lib/navigation/build';
import type { MenuScopeType } from '@/lib/navigation/types';
import { cookies } from 'next/headers';
import { PERMISSIONS } from '@/lib/auth/permissions';

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

  const permSet = new Set(permissions);
  const useObraContext = permSet.has('*') || permSet.has(PERMISSIONS.DASHBOARD_ENGENHARIA_VIEW);
  if (useObraContext) {
    const cookieStore = await cookies();
    const raw = cookieStore.get('exp_active_obra')?.value || '';
    const id = Number(raw || 0);
    if (Number.isInteger(id) && id > 0) redirect(`/dashboard/engenharia/obras/${id}`);
    redirect('/dashboard/engenharia/obras');
  }

  redirect(resolveHomeHref(ctx));
}
