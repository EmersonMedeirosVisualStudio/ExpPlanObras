import { ApiError, handleApiError, ok } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { listarPublicacoes } from '@/lib/modules/workflows-designer/server';

export const runtime = 'nodejs';

export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const current = await requireApiPermission(PERMISSIONS.WORKFLOWS_DESIGNER_VIEW);
    const { id } = await context.params;
    const modeloId = Number(id);
    if (!Number.isFinite(modeloId)) throw new ApiError(400, 'ID inválido');
    const data = await listarPublicacoes(current.tenantId, modeloId);
    return ok(data);
  } catch (e) {
    return handleApiError(e);
  }
}

