import { ApiError, handleApiError, ok } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { validarRascunho } from '@/lib/modules/workflows-designer/server';

export const runtime = 'nodejs';

export async function POST(_req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const current = await requireApiPermission(PERMISSIONS.WORKFLOWS_DESIGNER_CRUD);
    const { id } = await context.params;
    const rascunhoId = Number(id);
    if (!Number.isFinite(rascunhoId)) throw new ApiError(400, 'ID inválido');
    const data = await validarRascunho(current.tenantId, rascunhoId, current.id);
    return ok(data);
  } catch (e) {
    return handleApiError(e);
  }
}

