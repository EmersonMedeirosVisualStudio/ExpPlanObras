import { ok, fail, handleApiError } from '@/lib/api/http';
import { processPushQueue } from '@/lib/notifications/push/service';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    const secret = process.env.INTERNAL_JOB_SECRET || '';
    const header = req.headers.get('x-internal-secret') || '';
    if (!secret || header !== secret) return fail(401, 'Não autorizado');

    const url = new URL(req.url);
    const tenantId = url.searchParams.get('tenantId') ? Number(url.searchParams.get('tenantId')) : null;
    const limit = url.searchParams.get('limit') ? Number(url.searchParams.get('limit')) : null;
    const out = await processPushQueue({ tenantId, limit });
    return ok(out);
  } catch (e) {
    return handleApiError(e);
  }
}

