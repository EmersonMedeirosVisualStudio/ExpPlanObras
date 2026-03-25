import { ok, created, fail, handleApiError } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { criarModelo, listarModelos } from '@/lib/modules/automacoes/server';
import type { TarefaRecorrenteModeloSaveDTO } from '@/lib/modules/automacoes/types';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const current = await requireApiPermission(PERMISSIONS.AUTOMACOES_VIEW);
    const data = await listarModelos(current.tenantId);
    return ok(data);
  } catch (e) {
    return handleApiError(e);
  }
}

export async function POST(req: Request) {
  try {
    const current = await requireApiPermission(PERMISSIONS.AUTOMACOES_CRUD);
    const body = (await req.json()) as TarefaRecorrenteModeloSaveDTO;
    if (!body?.nome || !body?.modulo || !body?.recorrencia || !body?.horarioExecucao || !body?.tituloTarefa) {
      return fail(422, 'Campos obrigatórios ausentes.');
    }
    const id = await criarModelo(current.tenantId, body);
    return created({ id });
  } catch (e) {
    return handleApiError(e);
  }
}

