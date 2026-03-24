import { ok, handleApiError } from '@/lib/api/http';
import { requireAuthenticatedApiUser } from '@/lib/auth/require-authenticated-api-user';
import { getCurrentUserPermissions } from '@/lib/auth/get-current-user-permissions';
import { getDashboardScope } from '@/lib/dashboard/scope';
import { buildMenuResponse, type BuildMenuContext } from '@/lib/navigation/build';
import type { MenuScopeType } from '@/lib/navigation/types';

export const runtime = 'nodejs';

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

    const ctx: BuildMenuContext = { permissions, scopeTypes };
    return ok(buildMenuResponse(ctx));
  } catch (e) {
    return handleApiError(e);
  }
}
