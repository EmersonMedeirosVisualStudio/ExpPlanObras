import { ApiError, handleApiError, ok } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { obterDocumentoDetalhe } from '@/lib/modules/documentos/server';

export const runtime = 'nodejs';

export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const current = await requireApiPermission(PERMISSIONS.DOCUMENTOS_VIEW);
    const { id } = await context.params;
    const documentoId = Number(id);
    if (!Number.isFinite(documentoId)) throw new ApiError(400, 'ID inválido');

    const data = await obterDocumentoDetalhe(current.tenantId, documentoId);
    return ok(data);
  } catch (e) {
    return handleApiError(e);
  }
}

