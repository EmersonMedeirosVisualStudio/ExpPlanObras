import { ApiError, handleApiError, ok } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { obterExecucao } from '@/lib/modules/analytics/server';

export const runtime = 'nodejs';

export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const current = await requireApiPermission(PERMISSIONS.ANALYTICS_CARGAS_VIEW);
    const { id } = await context.params;
    const idExecucao = Number(id);
    if (!Number.isFinite(idExecucao)) throw new ApiError(400, 'ID inválido');
    const data = await obterExecucao({ tenantId: current.tenantId, idExecucao });
    return ok(data);
  } catch (e) {
    return handleApiError(e);
  }
}

