import { ApiError, handleApiError, ok } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { setStatusPolitica } from '@/lib/auth/policies/server';

export const runtime = 'nodejs';

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const current = await requireApiPermission(PERMISSIONS.SECURITY_POLICIES_CRUD);
    const { id } = await context.params;
    const policyId = Number(id);
    if (!Number.isFinite(policyId)) throw new ApiError(400, 'ID inválido.');

    const body = (await req.json().catch(() => null)) as any;
    const ativo = Boolean(body?.ativo);

    const data = await setStatusPolitica(current.tenantId, current.id, policyId, ativo);
    return ok(data);
  } catch (e) {
    return handleApiError(e);
  }
}
