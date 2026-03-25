import { ApiError, handleApiError, ok } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { db } from '@/lib/db';
import { getExternalDatasetHandler } from '@/lib/modules/analytics/external-datasets';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    const current = await requireApiPermission(PERMISSIONS.ANALYTICS_VIEW);
    const body = await req.json().catch(() => ({}));
    const dataset = String(body?.dataset || '').trim();
    if (!dataset) throw new ApiError(422, 'dataset obrigatório');
    const filtros = body?.filtros && typeof body.filtros === 'object' ? body.filtros : {};
    const limit = body?.limit !== undefined ? Number(body.limit) : 500;

    const handler = getExternalDatasetHandler(dataset);
    if (!handler) throw new ApiError(404, 'Dataset não encontrado.');

    const built = handler.buildSql({ tenantId: current.tenantId, filtros, limit: Number.isFinite(limit) ? limit : 500 });
    const [rows]: any = await db.query(built.sql, built.params);
    return ok({ dataset: handler.def, rows });
  } catch (e) {
    return handleApiError(e);
  }
}

