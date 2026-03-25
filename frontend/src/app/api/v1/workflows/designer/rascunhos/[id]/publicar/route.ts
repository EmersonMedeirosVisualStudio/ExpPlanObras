import { ApiError, handleApiError, ok } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { publicarRascunho } from '@/lib/modules/workflows-designer/server';

export const runtime = 'nodejs';

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const current = await requireApiPermission(PERMISSIONS.WORKFLOWS_PUBLICAR);
    const { id } = await context.params;
    const rascunhoId = Number(id);
    if (!Number.isFinite(rascunhoId)) throw new ApiError(400, 'ID inválido');
    const body = await req.json().catch(() => ({}));
    const data = await publicarRascunho(current.tenantId, rascunhoId, current.id, { changelogText: body?.changelogText ?? null });
    return ok(data);
  } catch (e) {
    return handleApiError(e);
  }
}

