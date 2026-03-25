import { handleApiError, ok } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { listarPipelines } from '@/lib/modules/analytics/server';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const current = await requireApiPermission(PERMISSIONS.ANALYTICS_CARGAS_VIEW);
    const data = await listarPipelines({ tenantId: current.tenantId });
    return ok(data);
  } catch (e) {
    return handleApiError(e);
  }
}

