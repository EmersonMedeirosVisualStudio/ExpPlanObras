import { ok, fail, handleApiError } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { searchGlobal } from '@/lib/search/server';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  try {
    const current = await requireApiPermission(PERMISSIONS.BUSCA_GLOBAL_VIEW);
    const { searchParams } = new URL(req.url);
    const q = String(searchParams.get('q') || '').trim();
    if (!q) return ok({ query: '', resultados: [], grupos: [] });
    const modulo = searchParams.get('modulo') ? String(searchParams.get('modulo')) : undefined;
    const data = await searchGlobal({ tenantId: current.tenantId, userId: current.id, query: q, modulo });
    return ok(data);
  } catch (e) {
    return handleApiError(e);
  }
}

