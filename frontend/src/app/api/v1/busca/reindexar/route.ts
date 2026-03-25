import { ok, fail, handleApiError } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { SEARCH_INDEX_PROVIDERS, getProviderByEntityType } from '@/lib/search/registry';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    const current = await requireApiPermission(PERMISSIONS.BUSCA_GLOBAL_REINDEXAR);
    const body = (await req.json().catch(() => null)) as { entidadeTipo?: string; entityId?: number } | null;
    const entidadeTipo = body?.entidadeTipo ? String(body.entidadeTipo) : null;
    const entityId = body?.entityId !== undefined ? Number(body.entityId) : null;

    if (entidadeTipo && entityId && Number.isFinite(entityId)) {
      const p = getProviderByEntityType(entidadeTipo);
      if (!p) return fail(404, 'Provider não encontrado');
      await p.reindexEntity(current.tenantId, entityId);
      return ok(null);
    }

    for (const p of SEARCH_INDEX_PROVIDERS) {
      if (p.reindexAll) await p.reindexAll(current.tenantId);
    }
    return ok(null);
  } catch (e) {
    return handleApiError(e);
  }
}

