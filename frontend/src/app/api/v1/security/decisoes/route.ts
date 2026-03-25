import { handleApiError, ok } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { listarAuditoriaDecisoes } from '@/lib/auth/policies/server';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  try {
    const current = await requireApiPermission(PERMISSIONS.SECURITY_POLICIES_AUDITORIA);
    const { searchParams } = new URL(req.url);
    const limit = searchParams.get('limit') ? Number(searchParams.get('limit')) : undefined;
    const data = await listarAuditoriaDecisoes(current.tenantId, { limit });
    return ok(data);
  } catch (e) {
    return handleApiError(e);
  }
}
