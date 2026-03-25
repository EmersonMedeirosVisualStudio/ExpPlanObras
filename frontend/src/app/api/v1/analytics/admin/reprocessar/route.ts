import { ApiError, handleApiError, ok } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { reprocessarPipeline } from '@/lib/modules/analytics/server';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    const current = await requireApiPermission(PERMISSIONS.ANALYTICS_CARGAS_EXECUTAR);
    const body = await req.json().catch(() => ({}));
    const pipelineNome = String(body?.pipelineNome || body?.pipeline || '').trim();
    if (!pipelineNome) throw new ApiError(422, 'pipelineNome obrigatório');
    const tenantId = body?.tenantId !== undefined && body?.tenantId !== null ? Number(body.tenantId) : current.tenantId;
    if (!Number.isFinite(tenantId)) throw new ApiError(422, 'tenantId inválido');
    const dataInicial = body?.dataInicial ? String(body.dataInicial) : null;
    const dataFinal = body?.dataFinal ? String(body.dataFinal) : null;
    const full = Boolean(body?.full);
    const data = await reprocessarPipeline({ tenantId, pipelineNome, dataInicial, dataFinal, full });
    return ok(data);
  } catch (e) {
    return handleApiError(e);
  }
}

