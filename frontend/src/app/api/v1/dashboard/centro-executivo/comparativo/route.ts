import { ok, handleApiError } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { getCurrentUserPermissions } from '@/lib/auth/get-current-user-permissions';
import { obterComparativoCentroExecutivo, parseCentroExecutivoFiltrosFromRequest } from '@/lib/modules/centro-executivo/server';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  try {
    const current = await requireApiPermission(PERMISSIONS.DASHBOARD_CENTRO_EXECUTIVO_VIEW);
    const filtros = parseCentroExecutivoFiltrosFromRequest(req);
    const permissions = await getCurrentUserPermissions(current.id);
    const data = await obterComparativoCentroExecutivo({ tenantId: current.tenantId, userId: current.id, permissions }, filtros);
    return ok(data);
  } catch (e) {
    return handleApiError(e);
  }
}

