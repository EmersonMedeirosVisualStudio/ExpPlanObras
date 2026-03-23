import { db } from '@/lib/db';
import { audit } from '@/lib/api/audit';
import { ApiError, handleApiError, ok } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { PERMISSIONS } from '@/lib/auth/permissions';

export const runtime = 'nodejs';

export async function DELETE(_req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const current = await requireApiPermission(PERMISSIONS.ORGANOGRAMA_CRUD);
    const { id } = await context.params;
    const vinculoId = Number(id);
    if (!Number.isFinite(vinculoId)) throw new ApiError(400, 'ID inválido');

    const [[row]]: any = await db.query(
      `
      SELECT v.id_vinculo
      FROM organograma_vinculos v
      INNER JOIN organograma_posicoes p1 ON p1.id_posicao = v.id_posicao_superior
      INNER JOIN organograma_posicoes p2 ON p2.id_posicao = v.id_posicao_subordinada
      WHERE v.id_vinculo = ? AND p1.tenant_id = ? AND p2.tenant_id = ?
      LIMIT 1
      `,
      [vinculoId, current.tenantId, current.tenantId]
    );
    if (!row) throw new ApiError(404, 'Vínculo não encontrado');

    await db.query(`UPDATE organograma_vinculos SET ativo = 0 WHERE id_vinculo = ?`, [vinculoId]);

    await audit({
      tenantId: current.tenantId,
      userId: current.id,
      entidade: 'organograma_vinculos',
      idRegistro: String(vinculoId),
      acao: 'DELETE',
    });

    return ok({ id: vinculoId });
  } catch (error) {
    return handleApiError(error);
  }
}
