import { ApiError, handleApiError, ok } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { listarExecucoes } from '@/lib/modules/analytics/server';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  try {
    const current = await requireApiPermission(PERMISSIONS.ANALYTICS_CARGAS_VIEW);
    const { searchParams } = new URL(req.url);
    const limit = searchParams.get('limit') ? Number(searchParams.get('limit')) : 100;
    if (!Number.isFinite(limit)) throw new ApiError(400, 'limit inválido');
    const data = await listarExecucoes({ tenantId: current.tenantId, limit });
    return ok(data);
  } catch (e) {
    return handleApiError(e);
  }
}

