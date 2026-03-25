import { handleApiError, ok } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { EXTERNAL_DATASETS } from '@/lib/modules/analytics/external-datasets';

export const runtime = 'nodejs';

export async function GET() {
  try {
    await requireApiPermission(PERMISSIONS.ANALYTICS_VIEW);
    const data = EXTERNAL_DATASETS.map((d) => d.def);
    return ok(data);
  } catch (e) {
    return handleApiError(e);
  }
}

