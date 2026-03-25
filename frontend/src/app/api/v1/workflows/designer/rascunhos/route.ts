import { ApiError, created, handleApiError, ok } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { criarRascunho, listarRascunhos } from '@/lib/modules/workflows-designer/server';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  try {
    const current = await requireApiPermission(PERMISSIONS.WORKFLOWS_DESIGNER_VIEW);
    const { searchParams } = new URL(req.url);
    const limit = searchParams.get('limit') ? Number(searchParams.get('limit')) : undefined;
    const data = await listarRascunhos(current.tenantId, { limit });
    return ok(data);
  } catch (e) {
    return handleApiError(e);
  }
}

export async function POST(req: Request) {
  try {
    const current = await requireApiPermission(PERMISSIONS.WORKFLOWS_DESIGNER_CRUD);
    const body = await req.json();
    const codigo = String(body?.codigo || '').trim();
    const nomeModelo = String(body?.nomeModelo || '').trim();
    const entidadeTipo = String(body?.entidadeTipo || '').trim();
    if (!codigo || !nomeModelo || !entidadeTipo) throw new ApiError(422, 'codigo, nomeModelo e entidadeTipo são obrigatórios.');
    const data = await criarRascunho(current.tenantId, current.id, body);
    return created(data);
  } catch (e) {
    return handleApiError(e);
  }
}

