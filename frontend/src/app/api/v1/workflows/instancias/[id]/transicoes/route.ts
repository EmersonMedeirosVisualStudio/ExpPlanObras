import { handleApiError, ok, fail } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { listarTransicoesDisponiveis } from '@/lib/modules/workflows/server';

export const runtime = 'nodejs';

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const current = await requireApiPermission(PERMISSIONS.WORKFLOWS_VIEW);
    const { id } = await ctx.params;
    const instanciaId = Number(id);
    if (!Number.isFinite(instanciaId)) return fail(400, 'ID inválido');
    const out = await listarTransicoesDisponiveis({ tenantId: current.tenantId, instanciaId, userId: current.id });
    return ok(out);
  } catch (e) {
    return handleApiError(e);
  }
}

