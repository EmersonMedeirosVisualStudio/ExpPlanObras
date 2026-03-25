import { ApiError, handleApiError, ok } from '@/lib/api/http';
import { db } from '@/lib/db';
import { getExternalDatasetHandler } from '@/lib/modules/analytics/external-datasets';
import { getBearerTokenFromRequest, verifyExternalToken } from '@/lib/modules/analytics/security';

export const runtime = 'nodejs';

export async function GET(req: Request, context: { params: Promise<{ dataset: string }> }) {
  try {
    const { dataset } = await context.params;
    const token = getBearerTokenFromRequest(req);
    if (!token) throw new ApiError(401, 'Token ausente.');
    const auth = await verifyExternalToken({ token });

    const handler = getExternalDatasetHandler(dataset);
    if (!handler) throw new ApiError(404, 'Dataset não encontrado.');
    if (!auth.datasets.includes(handler.def.key)) throw new ApiError(403, 'Dataset não permitido para este token.');

    const { searchParams } = new URL(req.url);
    const limit = searchParams.get('limit') ? Number(searchParams.get('limit')) : 1000;
    const filtros: Record<string, unknown> = {};
    for (const f of handler.def.filters) {
      const v = searchParams.get(f.key);
      if (v === null) continue;
      filtros[f.key] = v;
    }

    const built = handler.buildSql({ tenantId: auth.tenantId, filtros, limit: Number.isFinite(limit) ? limit : 1000 });
    const [rows]: any = await db.query(built.sql, built.params);
    return ok({ dataset: handler.def, rows });
  } catch (e) {
    return handleApiError(e);
  }
}

