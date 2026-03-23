import { db } from '@/lib/db';
import { audit } from '@/lib/api/audit';
import { ApiError, handleApiError, ok } from '@/lib/api/http';
import { requireCurrentEncarregado } from '@/lib/api/encarregado-authz';
import { PERMISSIONS } from '@/lib/auth/permissions';

export const runtime = 'nodejs';

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireCurrentEncarregado(PERMISSIONS.GOVERNANCA_USUARIOS_CRUD);
    const { id } = await params;
    const body = await req.json();

    const [[anterior]]: any = await db.query(`SELECT * FROM usuarios WHERE id_usuario = ? AND tenant_id = ?`, [id, user.tenantId]);
    if (!anterior) throw new ApiError(404, 'Usuário não encontrado.');

    await db.execute(`UPDATE usuarios SET email_login = ?, ativo = ?, bloqueado = ? WHERE id_usuario = ? AND tenant_id = ?`, [
      body.emailLogin,
      body.ativo,
      body.bloqueado,
      id,
      user.tenantId,
    ]);

    await audit({
      tenantId: user.tenantId,
      userId: user.id,
      entidade: 'usuarios',
      idRegistro: String(id),
      acao: 'UPDATE',
      dadosAnteriores: anterior,
      dadosNovos: body,
    });

    return ok(null, 'Usuário atualizado com sucesso.');
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireCurrentEncarregado(PERMISSIONS.GOVERNANCA_USUARIOS_CRUD);
    const { id } = await params;
    const body = await req.json();

    await db.execute(`UPDATE usuarios SET ativo = ?, bloqueado = ? WHERE id_usuario = ? AND tenant_id = ?`, [body.ativo, body.bloqueado, id, user.tenantId]);

    await audit({
      tenantId: user.tenantId,
      userId: user.id,
      entidade: 'usuarios',
      idRegistro: String(id),
      acao: 'PATCH_STATUS',
      dadosNovos: body,
    });

    return ok(null, 'Status do usuário atualizado.');
  } catch (error) {
    return handleApiError(error);
  }
}
