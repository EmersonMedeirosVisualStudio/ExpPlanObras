import { db } from '@/lib/db';
import { handleApiError, ok } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { PERMISSIONS } from '@/lib/auth/permissions';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const user = await requireApiPermission(PERMISSIONS.REPRESENTANTE_VIEW);

    const [rows]: any = await db.query(
      `SELECT id_funcionario id, nome_completo nome, cargo
       FROM funcionarios
       WHERE tenant_id = ? AND ativo = 1
       ORDER BY nome_completo`,
      [user.tenantId]
    );

    return ok(rows);
  } catch (error) {
    return handleApiError(error);
  }
}
