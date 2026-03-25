import { handleApiError, ok, fail } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { habilitarPinAssinaturaUsuario } from '@/lib/modules/aprovacoes/server';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    const current = await requireApiPermission(PERMISSIONS.APROVACOES_ASSINAR);
    const body = (await req.json().catch(() => null)) as { tipo?: string; pin?: string } | null;
    const tipo = String(body?.tipo || '').toUpperCase();
    if (tipo !== 'PIN') return fail(422, 'tipo inválido. Use PIN');
    const pin = String(body?.pin || '');
    await habilitarPinAssinaturaUsuario({ tenantId: current.tenantId, userId: current.id, pin });
    return ok(null);
  } catch (e) {
    return handleApiError(e);
  }
}

