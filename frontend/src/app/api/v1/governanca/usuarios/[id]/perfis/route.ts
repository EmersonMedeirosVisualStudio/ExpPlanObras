import { db } from '@/lib/db';
import { audit } from '@/lib/api/audit';
import { ApiError, handleApiError, ok } from '@/lib/api/http';
import { requireCurrentEncarregado } from '@/lib/api/encarregado-authz';
import { PERMISSIONS } from '@/lib/auth/permissions';

export const runtime = 'nodejs';

export async function PUT(req: Request, context: { params: Promise<{ id: string }> }) {
  const conn = await db.getConnection();
  try {
    const user = await requireCurrentEncarregado(PERMISSIONS.GOVERNANCA_PERFIS_CRUD);
    const { id } = await context.params;
    const body = await req.json();

    if (!Array.isArray(body.perfisIds)) throw new ApiError(400, 'perfisIds deve ser um array.');

    await conn.beginTransaction();

    await conn.execute(`DELETE FROM usuario_perfis WHERE id_usuario = ?`, [id]);

    for (const perfilId of body.perfisIds) {
      await conn.execute(`INSERT INTO usuario_perfis (id_usuario, id_perfil, ativo) VALUES (?, ?, 1)`, [id, perfilId]);
    }

    await audit({
      tenantId: user.tenantId,
      userId: user.id,
      entidade: 'usuario_perfis',
      idRegistro: String(id),
      acao: 'REPLACE_PERFIS',
      dadosNovos: body,
    });

    await conn.commit();
    return ok(null, 'Perfis do usuário atualizados.');
  } catch (error) {
    await conn.rollback();
    return handleApiError(error);
  } finally {
    conn.release();
  }
}
