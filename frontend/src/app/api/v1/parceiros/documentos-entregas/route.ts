import { created, handleApiError, ok } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { listarEntregasDocumentos } from '@/lib/modules/parceiros/server';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  try {
    const current = await requireApiPermission(PERMISSIONS.PARCEIROS_CONFORMIDADE_VIEW);
    const { searchParams } = new URL(req.url);
    const empresaId = searchParams.get('empresaId') ? Number(searchParams.get('empresaId')) : 0;
    const data = await listarEntregasDocumentos(current.tenantId, empresaId || 0);
    return ok(data);
  } catch (e) {
    return handleApiError(e);
  }
}

export async function POST(_req: Request) {
  try {
    await requireApiPermission(PERMISSIONS.PARCEIROS_CONFORMIDADE_VIEW);
    return created({ id: 0 });
  } catch (e) {
    return handleApiError(e);
  }
}
