import { ok, created, fail, handleApiError } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { criarPolitica, listarPoliticas } from '@/lib/modules/automacoes/server';
import type { SlaPoliticaSaveDTO } from '@/lib/modules/automacoes/types';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const current = await requireApiPermission(PERMISSIONS.AUTOMACOES_SLA_VIEW);
    const data = await listarPoliticas(current.tenantId);
    return ok(data);
  } catch (e) {
    return handleApiError(e);
  }
}

export async function POST(req: Request) {
  try {
    const current = await requireApiPermission(PERMISSIONS.AUTOMACOES_SLA_CRUD);
    const body = (await req.json()) as SlaPoliticaSaveDTO;
    if (!body?.nome || !body?.modulo || !body?.chavePendencia || !body?.entidadeTipo) return fail(422, 'Campos obrigatórios ausentes.');
    const id = await criarPolitica(current.tenantId, body);
    return created({ id });
  } catch (e) {
    return handleApiError(e);
  }
}

