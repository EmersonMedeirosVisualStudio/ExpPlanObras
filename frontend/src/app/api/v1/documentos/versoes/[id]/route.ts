import { ApiError, handleApiError, ok } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { obterVersaoDetalhe } from '@/lib/modules/documentos/server';

export const runtime = 'nodejs';

export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const current = await requireApiPermission(PERMISSIONS.DOCUMENTOS_VIEW);
    const { id } = await context.params;
    const versaoId = Number(id);
    if (!Number.isFinite(versaoId)) throw new ApiError(400, 'ID inválido');

    const data = await obterVersaoDetalhe(current.tenantId, versaoId);
    return ok(data);
  } catch (e) {
    return handleApiError(e);
  }
}

