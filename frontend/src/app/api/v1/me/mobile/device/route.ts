import { handleApiError, ok } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { upsertMobileDevice } from '@/lib/modules/mobile/server';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    const current = await requireApiPermission(PERMISSIONS.MOBILE_APP_VIEW);
    const body = await req.json().catch(() => ({}));
    const res = await upsertMobileDevice(current.tenantId, current.id, body);
    return ok(res);
  } catch (e) {
    return handleApiError(e);
  }
}

