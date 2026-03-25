import { created, handleApiError, ok, fail } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { criarModelo, listarModelos } from '@/lib/modules/workflows/server';
import type { WorkflowModeloSaveDTO } from '@/lib/modules/workflows/types';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const current = await requireApiPermission(PERMISSIONS.WORKFLOWS_MODELOS_VIEW);
    const data = await listarModelos(current.tenantId);
    return ok(data);
  } catch (e) {
    return handleApiError(e);
  }
}

export async function POST(req: Request) {
  try {
    const current = await requireApiPermission(PERMISSIONS.WORKFLOWS_MODELOS_CRUD);
    const body = (await req.json().catch(() => null)) as WorkflowModeloSaveDTO | null;
    if (!body) return fail(422, 'Body obrigatório');
    const out = await criarModelo(current.tenantId, body);
    return created(out);
  } catch (e) {
    return handleApiError(e);
  }
}

