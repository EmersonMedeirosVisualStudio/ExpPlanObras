import { handleApiError, ok, fail } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { atualizarModelo, obterModeloDetalhe } from '@/lib/modules/workflows/server';
import type { WorkflowModeloSaveDTO } from '@/lib/modules/workflows/types';

export const runtime = 'nodejs';

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const current = await requireApiPermission(PERMISSIONS.WORKFLOWS_MODELOS_VIEW);
    const { id } = await ctx.params;
    const idModelo = Number(id);
    if (!Number.isFinite(idModelo)) return fail(400, 'ID inválido');
    const out = await obterModeloDetalhe(current.tenantId, idModelo);
    return ok(out);
  } catch (e) {
    return handleApiError(e);
  }
}

export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const current = await requireApiPermission(PERMISSIONS.WORKFLOWS_MODELOS_CRUD);
    const { id } = await ctx.params;
    const idModelo = Number(id);
    if (!Number.isFinite(idModelo)) return fail(400, 'ID inválido');
    const body = (await req.json().catch(() => null)) as WorkflowModeloSaveDTO | null;
    if (!body) return fail(422, 'Body obrigatório');
    const out = await atualizarModelo(current.tenantId, idModelo, body);
    return ok(out);
  } catch (e) {
    return handleApiError(e);
  }
}

