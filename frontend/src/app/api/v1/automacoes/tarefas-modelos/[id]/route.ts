import { ok, fail, handleApiError } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { atualizarModelo } from '@/lib/modules/automacoes/server';
import type { TarefaRecorrenteModeloSaveDTO } from '@/lib/modules/automacoes/types';

export const runtime = 'nodejs';

export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const current = await requireApiPermission(PERMISSIONS.AUTOMACOES_CRUD);
    const { id } = await ctx.params;
    const modeloId = Number(id);
    if (!Number.isFinite(modeloId)) return fail(400, 'ID inválido');
    const body = (await req.json()) as TarefaRecorrenteModeloSaveDTO;
    await atualizarModelo(current.tenantId, modeloId, body);
    return ok(null);
  } catch (e) {
    return handleApiError(e);
  }
}

