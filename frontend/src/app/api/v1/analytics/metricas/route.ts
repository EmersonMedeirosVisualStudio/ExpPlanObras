import { handleApiError, ok } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { ANALYTICS_METRICS } from '@/lib/modules/analytics/semantic';

export const runtime = 'nodejs';

export async function GET() {
  try {
    await requireApiPermission(PERMISSIONS.ANALYTICS_VIEW);
    return ok(ANALYTICS_METRICS);
  } catch (e) {
    return handleApiError(e);
  }
}

