import { created, handleApiError, ok } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { criarDocumento, listarDocumentos } from '@/lib/modules/documentos/server';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  try {
    const current = await requireApiPermission(PERMISSIONS.DOCUMENTOS_VIEW);
    const { searchParams } = new URL(req.url);
    const limit = searchParams.get('limit') ? Number(searchParams.get('limit')) : undefined;
    const data = await listarDocumentos(current.tenantId, { limit });
    return ok(data);
  } catch (e) {
    return handleApiError(e);
  }
}

export async function POST(req: Request) {
  try {
    const current = await requireApiPermission(PERMISSIONS.DOCUMENTOS_CRUD);
    const body = await req.json();
    const data = await criarDocumento(current.tenantId, current.id, body);
    return created(data);
  } catch (e) {
    return handleApiError(e);
  }
}

