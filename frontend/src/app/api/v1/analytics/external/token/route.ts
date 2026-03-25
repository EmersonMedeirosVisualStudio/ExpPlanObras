import { ApiError, handleApiError, ok, created } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { criarExternalToken, desativarExternalToken, listarExternalTokens } from '@/lib/modules/analytics/server';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  try {
    const current = await requireApiPermission(PERMISSIONS.ANALYTICS_EXTERNOS_VIEW);
    const { searchParams } = new URL(req.url);
    const limit = searchParams.get('limit') ? Number(searchParams.get('limit')) : 100;
    const data = await listarExternalTokens({ tenantId: current.tenantId, limit: Number.isFinite(limit) ? limit : 100 });
    return ok(data);
  } catch (e) {
    return handleApiError(e);
  }
}

export async function POST(req: Request) {
  try {
    const current = await requireApiPermission(PERMISSIONS.ANALYTICS_EXTERNOS_CRUD);
    const body = await req.json().catch(() => ({}));
    const nome = String(body?.nome || '').trim();
    const datasets = Array.isArray(body?.datasets) ? body.datasets.map((d: any) => String(d)) : [];
    if (!nome) throw new ApiError(422, 'nome obrigatório');
    if (!datasets.length) throw new ApiError(422, 'datasets obrigatório');
    const expiraEm = body?.expiraEm ? String(body.expiraEm) : null;
    const data = await criarExternalToken({ tenantId: current.tenantId, nome, datasets, expiraEm });
    return created(data);
  } catch (e) {
    return handleApiError(e);
  }
}

export async function DELETE(req: Request) {
  try {
    const current = await requireApiPermission(PERMISSIONS.ANALYTICS_EXTERNOS_CRUD);
    const body = await req.json().catch(() => ({}));
    const tokenId = Number(body?.tokenId);
    if (!Number.isFinite(tokenId)) throw new ApiError(422, 'tokenId inválido');
    const data = await desativarExternalToken({ tenantId: current.tenantId, tokenId });
    return ok(data);
  } catch (e) {
    return handleApiError(e);
  }
}

