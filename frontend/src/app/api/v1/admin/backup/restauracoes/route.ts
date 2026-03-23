import { db } from '@/lib/db';
import { audit } from '@/lib/api/audit';
import { ApiError, created, handleApiError, ok } from '@/lib/api/http';
import { requireCurrentEncarregado } from '@/lib/api/encarregado-authz';
import { PERMISSIONS } from '@/lib/auth/permissions';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const user = await requireCurrentEncarregado(PERMISSIONS.BACKUP_VIEW);

    const [rows]: any = await db.query(
      `SELECT id_backup_restauracao id,
              ponto_referencia pontoReferencia,
              motivo,
              status,
              solicitado_em solicitadoEm,
              confirmado_em confirmadoEm,
              observacao
       FROM backup_restauracao_solicitacoes
       WHERE tenant_id = ?
       ORDER BY id_backup_restauracao DESC`,
      [user.tenantId]
    );

    return ok(rows);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireCurrentEncarregado(PERMISSIONS.BACKUP_RESTORE_REQUEST);
    const body = await req.json();

    if (!body.pontoReferencia || !body.motivo) {
      throw new ApiError(400, 'Ponto de referência e motivo são obrigatórios.');
    }

    const [result]: any = await db.execute(
      `INSERT INTO backup_restauracao_solicitacoes
        (tenant_id, solicitado_por, ponto_referencia, motivo, status)
       VALUES (?, ?, ?, ?, 'SOLICITADA')`,
      [user.tenantId, user.id, body.pontoReferencia, body.motivo]
    );

    await audit({
      tenantId: user.tenantId,
      userId: user.id,
      entidade: 'backup_restauracao_solicitacoes',
      idRegistro: String(result.insertId),
      acao: 'SOLICITAR_RESTAURACAO',
      dadosNovos: body,
    });

    return created({ id: result.insertId }, 'Solicitação de restauração registrada.');
  } catch (error) {
    return handleApiError(error);
  }
}
