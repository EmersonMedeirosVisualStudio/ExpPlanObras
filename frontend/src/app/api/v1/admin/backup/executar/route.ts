import { db } from '@/lib/db';
import { audit } from '@/lib/api/audit';
import { ApiError, handleApiError, ok } from '@/lib/api/http';
import { requireCurrentEncarregado } from '@/lib/api/encarregado-authz';
import { PERMISSIONS } from '@/lib/auth/permissions';

export const runtime = 'nodejs';

export async function POST() {
  try {
    const user = await requireCurrentEncarregado(PERMISSIONS.BACKUP_EDIT);

    const [[politica]]: any = await db.query(
      `SELECT id_backup_politica
       FROM backup_politicas_tenant
       WHERE tenant_id = ? AND ativo = 1
       ORDER BY id_backup_politica DESC
       LIMIT 1`,
      [user.tenantId]
    );
    if (!politica) throw new ApiError(400, 'Defina primeiro a política de backup.');

    const [result]: any = await db.execute(
      `INSERT INTO backup_execucoes_tenant
        (id_backup_politica, tenant_id, data_hora_inicio, status, observacao)
       VALUES (?, ?, NOW(), 'EXECUTANDO', 'Execução manual solicitada pelo Encarregado do Sistema')`,
      [politica.id_backup_politica, user.tenantId]
    );

    await audit({
      tenantId: user.tenantId,
      userId: user.id,
      entidade: 'backup_execucoes_tenant',
      idRegistro: String(result.insertId),
      acao: 'SOLICITAR_BACKUP_MANUAL',
    });

    return ok(
      { id: result.insertId, status: 'EXECUTANDO' },
      'Execução manual de backup registrada. O processamento deve ocorrer em worker/cron.'
    );
  } catch (error) {
    return handleApiError(error);
  }
}
