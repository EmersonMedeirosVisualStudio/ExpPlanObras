import { audit } from '@/lib/api/audit';
import { ApiError, handleApiError, ok } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { PERMISSIONS } from '@/lib/auth/permissions';

export const runtime = 'nodejs';

export async function POST(_req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireApiPermission(PERMISSIONS.GOVERNANCA_USUARIOS_CRUD);
    const { id } = await context.params;
    const idUsuario = Number(id);
    if (!Number.isFinite(idUsuario)) throw new ApiError(400, 'ID inválido.');

    await audit({
      tenantId: user.tenantId,
      userId: user.id,
      entidade: 'usuarios',
      idRegistro: String(idUsuario),
      acao: 'RESET_ACESSO',
      dadosNovos: { requestedAt: new Date().toISOString() },
    });

    return ok(null, 'Link de redefinição gerado com sucesso.');
  } catch (error) {
    return handleApiError(error);
  }
}

