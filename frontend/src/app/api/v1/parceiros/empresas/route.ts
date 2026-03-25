import { created, handleApiError, ok } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { criarEmpresaParceira, listarEmpresasParceiras } from '@/lib/modules/parceiros/server';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  try {
    const current = await requireApiPermission(PERMISSIONS.PARCEIROS_EMPRESAS_VIEW);
    const { searchParams } = new URL(req.url);
    const q = searchParams.get('q');
    const limit = searchParams.get('limit') ? Number(searchParams.get('limit')) : undefined;
    const data = await listarEmpresasParceiras(current.tenantId, q, limit);
    return ok(data);
  } catch (e) {
    return handleApiError(e);
  }
}

export async function POST(req: Request) {
  try {
    const current = await requireApiPermission(PERMISSIONS.PARCEIROS_EMPRESAS_CRUD);
    const body = (await req.json().catch(() => null)) as any;
    const res = await criarEmpresaParceira(current.tenantId, {
      razaoSocial: body?.razaoSocial,
      nomeFantasia: body?.nomeFantasia ?? null,
      cnpj: body?.cnpj,
      emailPrincipal: body?.emailPrincipal ?? null,
      telefonePrincipal: body?.telefonePrincipal ?? null,
    });
    return created(res);
  } catch (e) {
    return handleApiError(e);
  }
}
