import { ok, fail, handleApiError } from '@/lib/api/http';
import { detectarPendenciasSla } from '@/lib/modules/automacoes/server';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    const secret = process.env.INTERNAL_JOB_SECRET || '';
    const header = req.headers.get('x-internal-secret') || '';
    if (!secret || header !== secret) return fail(401, 'Não autorizado');

    const url = new URL(req.url);
    const tenantId = Number(url.searchParams.get('tenantId') || 0);
    if (!tenantId) return fail(422, 'tenantId obrigatório');

    const out = await detectarPendenciasSla({ tenantId, userId: 0, manual: false });
    return ok(out);
  } catch (e) {
    return handleApiError(e);
  }
}

