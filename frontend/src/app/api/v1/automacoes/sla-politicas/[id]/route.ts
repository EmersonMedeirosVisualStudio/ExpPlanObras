import { ok, fail, handleApiError } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { atualizarPolitica } from '@/lib/modules/automacoes/server';
import type { SlaPoliticaSaveDTO } from '@/lib/modules/automacoes/types';

export const runtime = 'nodejs';

export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const current = await requireApiPermission(PERMISSIONS.AUTOMACOES_SLA_CRUD);
    const { id } = await ctx.params;
    const politicaId = Number(id);
    if (!Number.isFinite(politicaId)) return fail(400, 'ID inválido');
    const body = (await req.json()) as SlaPoliticaSaveDTO;
    await atualizarPolitica(current.tenantId, politicaId, body);
    return ok(null);
  } catch (e) {
    return handleApiError(e);
  }
}

