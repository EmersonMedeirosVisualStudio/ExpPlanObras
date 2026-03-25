import { handleApiError, ok, fail } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { atualizarModelo, obterModeloDetalhe } from '@/lib/modules/aprovacoes/server';
import type { AprovacaoModeloSaveDTO } from '@/lib/modules/aprovacoes/types';

export const runtime = 'nodejs';

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const current = await requireApiPermission(PERMISSIONS.APROVACOES_MODELOS_VIEW);
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
    const current = await requireApiPermission(PERMISSIONS.APROVACOES_MODELOS_CRUD);
    const { id } = await ctx.params;
    const idModelo = Number(id);
    if (!Number.isFinite(idModelo)) return fail(400, 'ID inválido');
    const body = (await req.json().catch(() => null)) as AprovacaoModeloSaveDTO | null;
    if (!body) return fail(422, 'Body obrigatório');
    await atualizarModelo(current.tenantId, idModelo, body);
    return ok(null);
  } catch (e) {
    return handleApiError(e);
  }
}

