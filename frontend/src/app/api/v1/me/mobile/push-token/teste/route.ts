import { handleApiError, ok } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { PERMISSIONS } from '@/lib/auth/permissions';

export const runtime = 'nodejs';

export async function POST(_req: Request) {
  try {
    const current = await requireApiPermission(PERMISSIONS.MOBILE_PUSH_ADMIN);
    return ok({ status: 'queued', userId: current.id });
  } catch (e) {
    return handleApiError(e);
  }
}

