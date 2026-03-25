import { handleApiError, ok } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { listarMinhasPendenciasAprovacao } from '@/lib/modules/aprovacoes/server';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const current = await requireApiPermission(PERMISSIONS.APROVACOES_VIEW);
    const data = await listarMinhasPendenciasAprovacao(current.tenantId, current.id);
    return ok(data);
  } catch (e) {
    return handleApiError(e);
  }
}

