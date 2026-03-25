import { created, handleApiError, ok, fail } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { criarInstanciaWorkflow, listarInstanciasWorkflow } from '@/lib/modules/workflows/server';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  try {
    const current = await requireApiPermission(PERMISSIONS.WORKFLOWS_VIEW);
    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status') ? String(searchParams.get('status')) : null;
    const entidadeTipo = searchParams.get('entidadeTipo') ? String(searchParams.get('entidadeTipo')) : null;
    const limit = searchParams.get('limit') ? Number(searchParams.get('limit')) : null;
    const minhas = searchParams.get('minhas') ? String(searchParams.get('minhas')) === 'true' : false;
    const data = await listarInstanciasWorkflow(current.tenantId, { status, entidadeTipo, limit, minhas, userId: current.id });
    return ok(data);
  } catch (e) {
    return handleApiError(e);
  }
}

export async function POST(req: Request) {
  try {
    const current = await requireApiPermission(PERMISSIONS.WORKFLOWS_CRUD);
    const body = (await req.json().catch(() => null)) as { entidadeTipo?: string; entidadeId?: number; idModelo?: number | null } | null;
    const entidadeTipo = String(body?.entidadeTipo || '').trim().toUpperCase();
    const entidadeId = body?.entidadeId !== undefined ? Number(body.entidadeId) : NaN;
    const idModelo = body?.idModelo !== undefined && body?.idModelo !== null ? Number(body.idModelo) : null;
    if (!entidadeTipo) return fail(422, 'entidadeTipo obrigatório');
    if (!Number.isFinite(entidadeId)) return fail(422, 'entidadeId obrigatório');
    const out = await criarInstanciaWorkflow({ tenantId: current.tenantId, entidadeTipo, entidadeId, userId: current.id, idModelo });
    return created(out);
  } catch (e) {
    return handleApiError(e);
  }
}

