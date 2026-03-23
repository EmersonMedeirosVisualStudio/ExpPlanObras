import { db } from '@/lib/db';
import { audit } from '@/lib/api/audit';
import { ApiError, handleApiError, ok } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { PERMISSIONS } from '@/lib/auth/permissions';

export const runtime = 'nodejs';

export async function PATCH(req: Request, context: { params: Promise<{ id: string }> }) {
  const conn = await db.getConnection();
  try {
    const user = await requireApiPermission(PERMISSIONS.RH_HORAS_EXTRAS_PROCESSAR);
    const { id } = await context.params;
    const idHoraExtra = Number(id);
    if (!Number.isFinite(idHoraExtra)) throw new ApiError(400, 'ID inválido.');

    const body = await req.json();
    const statusHe = String(body?.statusHe || 'PROCESSADA').toUpperCase();
    const observacao = body?.observacao ? String(body.observacao) : null;
    if (!['PROCESSADA', 'REJEITADA', 'CANCELADA'].includes(statusHe)) throw new ApiError(400, 'statusHe inválido.');

    const [[before]]: any = await conn.query(
      `SELECT id_hora_extra, status_he
       FROM funcionarios_horas_extras
       WHERE tenant_id = ? AND id_hora_extra = ?
       LIMIT 1`,
      [user.tenantId, idHoraExtra]
    );
    if (!before) throw new ApiError(404, 'Registro não encontrado.');

    await conn.beginTransaction();
    await conn.execute(
      `
      UPDATE funcionarios_horas_extras
      SET
        status_he = ?,
        id_aprovador_rh = ?,
        data_processamento_rh = NOW(),
        observacao = ?
      WHERE tenant_id = ? AND id_hora_extra = ?
      `,
      [statusHe, user.id, observacao, user.tenantId, idHoraExtra]
    );

    await audit({
      tenantId: user.tenantId,
      userId: user.id,
      entidade: 'funcionarios_horas_extras',
      idRegistro: String(idHoraExtra),
      acao: 'PROCESSAR_RH',
      dadosAnteriores: before,
      dadosNovos: { statusHe, observacao },
    });

    await conn.commit();
    return ok(null, 'Processamento registrado.');
  } catch (error) {
    await conn.rollback();
    return handleApiError(error);
  } finally {
    conn.release();
  }
}

