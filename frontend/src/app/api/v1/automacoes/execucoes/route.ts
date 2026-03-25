import { ok, handleApiError } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { listarExecucoes } from '@/lib/modules/automacoes/server';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const current = await requireApiPermission(PERMISSIONS.AUTOMACOES_AUDITORIA);
    const data = await listarExecucoes(current.tenantId);
    return ok(data);
  } catch (e) {
    return handleApiError(e);
  }
}

