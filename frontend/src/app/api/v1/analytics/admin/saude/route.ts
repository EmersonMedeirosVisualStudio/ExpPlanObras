import { handleApiError, ok } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { obterSaudePipelines } from '@/lib/modules/analytics/server';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const current = await requireApiPermission(PERMISSIONS.ANALYTICS_ADMIN);
    const data = await obterSaudePipelines({ tenantId: current.tenantId });
    return ok(data);
  } catch (e) {
    return handleApiError(e);
  }
}

