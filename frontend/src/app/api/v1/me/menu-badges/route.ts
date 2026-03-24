import { ok, handleApiError } from '@/lib/api/http';
import { requireAuthenticatedApiUser } from '@/lib/auth/require-authenticated-api-user';
import { getCurrentUserPermissions } from '@/lib/auth/get-current-user-permissions';
import { getDashboardScope } from '@/lib/dashboard/scope';
import { buildMenuResponse, type BuildMenuContext } from '@/lib/navigation/build';
import type { MenuScopeType } from '@/lib/navigation/types';
import { buildMenuBadges } from '@/lib/navigation/build-menu-badges';
import type { MenuItemDTO } from '@/lib/navigation/types';

export const runtime = 'nodejs';

function collectKeys(items: MenuItemDTO[], out: Set<string>) {
  for (const it of items) {
    out.add(it.key);
    if (it.children?.length) collectKeys(it.children, out);
  }
}

export async function GET() {
  try {
    const user = await requireAuthenticatedApiUser();
    const permissions = await getCurrentUserPermissions(user.id);
    const scope = await getDashboardScope(user);

    const scopeTypes = [
      scope.empresaTotal ? 'EMPRESA' : null,
      ...(scope.diretorias?.length ? ['DIRETORIA'] : []),
      ...(scope.obras?.length ? ['OBRA'] : []),
      ...(scope.unidades?.length ? ['UNIDADE'] : []),
    ].filter(Boolean) as MenuScopeType[];

    const menuCtx: BuildMenuContext = { permissions, scopeTypes };
    const menu = buildMenuResponse(menuCtx);

    const allowedKeys = new Set<string>();
    for (const secao of menu.secoes) collectKeys(secao.items, allowedKeys);

    const badges = await buildMenuBadges(
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

    return ok(badges);
  } catch (e) {
    return handleApiError(e);
  }
}

