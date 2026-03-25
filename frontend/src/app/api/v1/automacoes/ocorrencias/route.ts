import { ok, handleApiError } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { listarOcorrencias } from '@/lib/modules/automacoes/server';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  try {
    const current = await requireApiPermission(PERMISSIONS.AUTOMACOES_VIEW);
    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status') ? String(searchParams.get('status')) : undefined;
    const modulo = searchParams.get('modulo') ? String(searchParams.get('modulo')) : undefined;
    const severidade = searchParams.get('severidade') ? String(searchParams.get('severidade')) : undefined;
    const vencidas = searchParams.get('vencidas') === '1' || searchParams.get('vencidas') === 'true';
    const limit = searchParams.get('limit') ? Number(searchParams.get('limit')) : undefined;
    const data = await listarOcorrencias(current.tenantId, { status: status as any, modulo, severidade, vencidas, limit });
    return ok(data);
  } catch (e) {
    return handleApiError(e);
  }
}

