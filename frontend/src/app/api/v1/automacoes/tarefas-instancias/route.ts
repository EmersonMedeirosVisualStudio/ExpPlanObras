import { ok, handleApiError } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { listarInstancias } from '@/lib/modules/automacoes/server';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  try {
    const current = await requireApiPermission(PERMISSIONS.AUTOMACOES_VIEW);
    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status') ? String(searchParams.get('status')) : undefined;
    const userId = searchParams.get('userId') ? Number(searchParams.get('userId')) : undefined;
    const limit = searchParams.get('limit') ? Number(searchParams.get('limit')) : undefined;
    const data = await listarInstancias(current.tenantId, { status: status as any, userId, limit });
    return ok(data);
  } catch (e) {
    return handleApiError(e);
  }
}

