import { ok, fail, handleApiError } from '@/lib/api/http';
import { SEARCH_INDEX_PROVIDERS, getProviderByEntityType } from '@/lib/search/registry';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    const secret = process.env.INTERNAL_JOB_SECRET || '';
    const header = req.headers.get('x-internal-secret') || '';
    if (!secret || header !== secret) return fail(401, 'Não autorizado');

    const url = new URL(req.url);
    const entidadeTipo = url.searchParams.get('entidadeTipo');
    const tenantId = Number(url.searchParams.get('tenantId') || 0);
    const batch = Math.min(Math.max(Number(url.searchParams.get('batch') || 1), 1), 5);
    if (!tenantId) return fail(422, 'tenantId obrigatório');

    if (entidadeTipo) {
      const p = getProviderByEntityType(entidadeTipo);
      if (!p || !p.reindexAll) return fail(404, 'Provider não encontrado');
      for (let i = 0; i < batch; i++) {
        await p.reindexAll(tenantId);
      }
      return ok({ status: 'ok', entidadeTipo, tenantId });
    }

    for (const p of SEARCH_INDEX_PROVIDERS) {
      if (!p.reindexAll) continue;
      for (let i = 0; i < batch; i++) await p.reindexAll(tenantId);
    }

    return ok({ status: 'ok', tenantId });
  } catch (e) {
    return handleApiError(e);
  }
}

