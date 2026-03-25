import { handleApiError, ok } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { getDashboardScope } from '@/lib/dashboard/scope';
import { resolvePortalGestorFiltrosFromSearchParams } from '@/lib/modules/portal-gestor/scope';
import { assertPortalScopeHasLocal, obterAgendaPortalGestor } from '@/lib/modules/portal-gestor/server';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  try {
    const current = await requireApiPermission(PERMISSIONS.PORTAL_GESTOR_VIEW);
    const scope = await getDashboardScope(current);
    await assertPortalScopeHasLocal(scope);

    const { searchParams } = new URL(req.url);
    const { filtros } = resolvePortalGestorFiltrosFromSearchParams(scope, searchParams);

    const data = await obterAgendaPortalGestor({ tenantId: current.tenantId, userId: current.id, scope, filtros });
    return ok(data);
  } catch (e) {
    return handleApiError(e);
  }
}

