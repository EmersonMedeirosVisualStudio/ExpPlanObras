import { ApiError, handleApiError, ok } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { validarDocumentoParceiro } from '@/lib/modules/parceiros/server';

export const runtime = 'nodejs';

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const current = await requireApiPermission(PERMISSIONS.PARCEIROS_DOCUMENTOS_VALIDAR);
    const { id } = await context.params;
    const entregaId = Number(id);
    if (!Number.isFinite(entregaId)) throw new ApiError(400, 'ID inválido.');
    const body = (await req.json().catch(() => null)) as any;
    const data = await validarDocumentoParceiro(current.tenantId, entregaId, {
      aprovar: Boolean(body?.aprovar),
      motivoRejeicao: body?.motivoRejeicao ?? null,
      userIdValidador: current.id,
    });
    return ok(data);
  } catch (e) {
    return handleApiError(e);
  }
}
