import { handleApiError, ok, fail } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { executarTransicaoWorkflow } from '@/lib/modules/workflows/server';
import type { WorkflowAcaoExecuteDTO } from '@/lib/modules/workflows/types';

export const runtime = 'nodejs';

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const current = await requireApiPermission(PERMISSIONS.WORKFLOWS_EXECUTAR);
    const { id } = await ctx.params;
    const instanciaId = Number(id);
    if (!Number.isFinite(instanciaId)) return fail(400, 'ID inválido');
    const body = (await req.json().catch(() => null)) as WorkflowAcaoExecuteDTO | null;
    if (!body?.chaveTransicao) return fail(422, 'chaveTransicao obrigatória');
    await executarTransicaoWorkflow({
      tenantId: current.tenantId,
      instanciaId,
      userId: current.id,
      acao: body,
      ip: req.headers.get('x-forwarded-for') || null,
      userAgent: req.headers.get('user-agent') || null,
    });
    return ok(null);
  } catch (e) {
    return handleApiError(e);
  }
}

