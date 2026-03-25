import { ok, handleApiError } from '@/lib/api/http';
import { requireAuthenticatedApiUser } from '@/lib/auth/require-authenticated-api-user';
import { registerSearchAccess } from '@/lib/search/server';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    const user = await requireAuthenticatedApiUser();
    const body = (await req.json().catch(() => null)) as any;
    await registerSearchAccess({
      tenantId: user.tenantId,
      userId: user.id,
      entidadeTipo: body?.entidadeTipo ? String(body.entidadeTipo) : null,
      entidadeId: Number.isFinite(Number(body?.entidadeId)) ? Number(body.entidadeId) : null,
      titulo: String(body?.titulo || ''),
      rota: String(body?.rota || ''),
      modulo: String(body?.modulo || 'GERAL'),
    });
    return ok(null);
  } catch (e) {
    return handleApiError(e);
  }
}

