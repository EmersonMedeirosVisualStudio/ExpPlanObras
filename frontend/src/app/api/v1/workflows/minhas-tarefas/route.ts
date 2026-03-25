import { handleApiError, ok } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { listarMinhasTarefasWorkflow } from '@/lib/modules/workflows/server';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const current = await requireApiPermission(PERMISSIONS.WORKFLOWS_VIEW);
    const data = await listarMinhasTarefasWorkflow(current.tenantId, current.id);
    return ok(data);
  } catch (e) {
    return handleApiError(e);
  }
}

