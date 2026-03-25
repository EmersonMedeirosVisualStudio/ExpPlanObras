import { ok, handleApiError } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { getSearchSuggestions } from '@/lib/search/server';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const current = await requireApiPermission(PERMISSIONS.BUSCA_GLOBAL_VIEW);
    const data = await getSearchSuggestions({ tenantId: current.tenantId, userId: current.id });
    return ok(data);
  } catch (e) {
    return handleApiError(e);
  }
}

