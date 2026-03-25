import { ApiError, handleApiError, ok } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { hasPermission } from '@/lib/auth/access';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { unlockRascunho } from '@/lib/modules/workflows-designer/server';

export const runtime = 'nodejs';

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const current = await requireApiPermission(PERMISSIONS.WORKFLOWS_DESIGNER_CRUD);
    const { id } = await context.params;
    const rascunhoId = Number(id);
    if (!Number.isFinite(rascunhoId)) throw new ApiError(400, 'ID inválido');
    const body = await req.json().catch(() => ({}));
    const force = Boolean(body?.force);
    if (force && !hasPermission(current, PERMISSIONS.WORKFLOWS_PUBLICAR)) throw new ApiError(403, 'Acesso negado.');
    const data = await unlockRascunho(current.tenantId, rascunhoId, current.id, { force });
    return ok(data);
  } catch (e) {
    return handleApiError(e);
  }
}

