import { handleApiError, ok, fail } from '@/lib/api/http';
import { db } from '@/lib/db';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    const secret = process.env.INTERNAL_JOB_SECRET || '';
    const header = req.headers.get('x-internal-secret') || '';
    if (!secret || header !== secret) return fail(401, 'Não autorizado');

    let removidosExpirados = 0;
    let removidosAntigos = 0;
    try {
      const [res1]: any = await db.execute(`DELETE FROM realtime_eventos WHERE expira_em IS NOT NULL AND expira_em < NOW()`);
      removidosExpirados = Number(res1?.affectedRows || 0);
    } catch {}
    try {
      const [res2]: any = await db.execute(`DELETE FROM realtime_eventos WHERE criado_em < DATE_SUB(NOW(), INTERVAL 7 DAY)`);
      removidosAntigos = Number(res2?.affectedRows || 0);
    } catch {}

    return ok({ status: 'ok', removidosExpirados, removidosAntigos });
  } catch (e) {
    return handleApiError(e);
  }
}

