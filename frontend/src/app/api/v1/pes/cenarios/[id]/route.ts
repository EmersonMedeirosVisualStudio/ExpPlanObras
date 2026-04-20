import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { ok, fail, handleApiError } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { canAccessObra } from '@/lib/auth/access';

export const runtime = 'nodejs';

export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const current = await requireApiPermission(PERMISSIONS.DASHBOARD_ENGENHARIA_VIEW);

    const { id } = await context.params;

    const [rows]: any = await db.query(
      `SELECT id, id_obra as idObra, nome, tipo, dados, created_at as createdAt, updated_at as updatedAt 
       FROM engenharia_pes_cenarios 
       WHERE id = ? AND tenant_id = ?`,
      [id, current.tenantId]
    );

    if (!rows.length) return fail(404, 'Cenário não encontrado.');

    const cenario = rows[0];
    if (!canAccessObra(current as any, cenario.idObra)) return fail(403, 'Acesso negado a esta obra.');

    return ok({
      ...cenario,
      dados: typeof cenario.dados === 'string' ? JSON.parse(cenario.dados) : cenario.dados
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const current = await requireApiPermission(PERMISSIONS.DASHBOARD_ENGENHARIA_VIEW);

    const { id } = await context.params;

    const [rows]: any = await db.query(
      `SELECT id_obra as idObra FROM engenharia_pes_cenarios WHERE id = ? AND tenant_id = ?`,
      [id, current.tenantId]
    );

    if (!rows.length) return fail(404, 'Cenário não encontrado.');

    if (!canAccessObra(current as any, rows[0].idObra)) return fail(403, 'Acesso negado a esta obra.');

    await db.query(`DELETE FROM engenharia_pes_cenarios WHERE id = ? AND tenant_id = ?`, [id, current.tenantId]);

    return ok({ message: 'Cenário excluído com sucesso.' });
  } catch (error) {
    return handleApiError(error);
  }
}
