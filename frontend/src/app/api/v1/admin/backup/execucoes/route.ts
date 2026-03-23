import { db } from '@/lib/db';
import { handleApiError, ok } from '@/lib/api/http';
import { requireCurrentEncarregado } from '@/lib/api/encarregado-authz';
import { PERMISSIONS } from '@/lib/auth/permissions';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  try {
    const user = await requireCurrentEncarregado(PERMISSIONS.BACKUP_VIEW);
    const { searchParams } = new URL(req.url);
    const limite = Number(searchParams.get('limite') || 20);

    const [rows]: any = await db.query(
      `SELECT id_backup_execucao id,
              data_hora_inicio inicio,
              data_hora_fim fim,
              status,
              referencia_arquivo referenciaArquivo,
              hash_arquivo hashArquivo,
              observacao
       FROM backup_execucoes_tenant
       WHERE tenant_id = ?
       ORDER BY id_backup_execucao DESC
       LIMIT ?`,
      [user.tenantId, limite]
    );

    return ok(rows, undefined, { limite });
  } catch (error) {
    return handleApiError(error);
  }
}
