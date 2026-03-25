import { handleApiError, ok, fail } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { obterSolicitacaoDetalhe } from '@/lib/modules/aprovacoes/server';

export const runtime = 'nodejs';

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const current = await requireApiPermission(PERMISSIONS.APROVACOES_VIEW);
    const { id } = await ctx.params;
    const solicitacaoId = Number(id);
    if (!Number.isFinite(solicitacaoId)) return fail(400, 'ID inválido');
    const out = await obterSolicitacaoDetalhe(current.tenantId, solicitacaoId);
    return ok(out);
  } catch (e) {
    return handleApiError(e);
  }
}

