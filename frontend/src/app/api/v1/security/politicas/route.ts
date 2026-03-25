import { created, handleApiError, ok } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { criarPolitica, listarPoliticas } from '@/lib/auth/policies/server';
import type { PolicyAction, PolicyResource } from '@/lib/auth/policies/types';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const current = await requireApiPermission(PERMISSIONS.SECURITY_POLICIES_VIEW);
    const data = await listarPoliticas(current.tenantId);
    return ok(data);
  } catch (e) {
    return handleApiError(e);
  }
}

export async function POST(req: Request) {
  try {
    const current = await requireApiPermission(PERMISSIONS.SECURITY_POLICIES_CRUD);
    const body = (await req.json().catch(() => null)) as any;
    const res = await criarPolitica(current.tenantId, current.id, {
      nomePolitica: body?.nomePolitica,
      recurso: String(body?.recurso || '').toUpperCase() as PolicyResource,
      acao: String(body?.acao || '').toUpperCase() as PolicyAction,
      descricaoPolitica: body?.descricaoPolitica ?? null,
      prioridadeBase: body?.prioridadeBase ?? 0,
      regras: body?.regras,
      alvos: body?.alvos,
    });
    return created(res);
  } catch (e) {
    return handleApiError(e);
  }
}
