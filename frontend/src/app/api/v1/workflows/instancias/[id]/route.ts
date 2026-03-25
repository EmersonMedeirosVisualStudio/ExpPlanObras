import { handleApiError, ok, fail } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { obterInstanciaWorkflow } from '@/lib/modules/workflows/server';

export const runtime = 'nodejs';

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const current = await requireApiPermission(PERMISSIONS.WORKFLOWS_VIEW);
    const { id } = await ctx.params;
    const instanciaId = Number(id);
    if (!Number.isFinite(instanciaId)) return fail(400, 'ID inválido');
    const out = await obterInstanciaWorkflow(current.tenantId, instanciaId);
    return ok(out);
  } catch (e) {
    return handleApiError(e);
  }
}

