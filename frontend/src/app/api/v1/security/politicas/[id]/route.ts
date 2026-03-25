import { ApiError, handleApiError, ok } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { atualizarPolitica, obterPolitica } from '@/lib/auth/policies/server';

export const runtime = 'nodejs';

export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const current = await requireApiPermission(PERMISSIONS.SECURITY_POLICIES_VIEW);
    const { id } = await context.params;
    const policyId = Number(id);
    if (!Number.isFinite(policyId)) throw new ApiError(400, 'ID inválido.');
    const data = await obterPolitica(current.tenantId, policyId);
    return ok(data);
  } catch (e) {
    return handleApiError(e);
  }
}

export async function PUT(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const current = await requireApiPermission(PERMISSIONS.SECURITY_POLICIES_CRUD);
    const { id } = await context.params;
    const policyId = Number(id);
    if (!Number.isFinite(policyId)) throw new ApiError(400, 'ID inválido.');
    const body = (await req.json().catch(() => null)) as any;
    await atualizarPolitica(current.tenantId, current.id, policyId, {
      nomePolitica: body?.nomePolitica,
      descricaoPolitica: body?.descricaoPolitica ?? null,
      prioridadeBase: body?.prioridadeBase ?? 0,
      regras: body?.regras,
      alvos: body?.alvos,
    });
    return ok(null);
  } catch (e) {
    return handleApiError(e);
  }
}
