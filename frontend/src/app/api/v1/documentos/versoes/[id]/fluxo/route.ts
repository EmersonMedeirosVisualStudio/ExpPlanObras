import { ApiError, handleApiError, ok } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { obterVersaoDetalhe, upsertFluxoAssinatura } from '@/lib/modules/documentos/server';

export const runtime = 'nodejs';

export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const current = await requireApiPermission(PERMISSIONS.DOCUMENTOS_VIEW);
    const { id } = await context.params;
    const versaoId = Number(id);
    if (!Number.isFinite(versaoId)) throw new ApiError(400, 'ID inválido');

    const data = await obterVersaoDetalhe(current.tenantId, versaoId);
    return ok(data.fluxo);
  } catch (e) {
    return handleApiError(e);
  }
}

export async function PUT(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const current = await requireApiPermission(PERMISSIONS.DOCUMENTOS_CRUD);
    const { id } = await context.params;
    const versaoId = Number(id);
    if (!Number.isFinite(versaoId)) throw new ApiError(400, 'ID inválido');

    const body = await req.json();
    const data = await upsertFluxoAssinatura({ tenantId: current.tenantId, versaoId, userId: current.id, body });
    return ok(data);
  } catch (e) {
    return handleApiError(e);
  }
}

