import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { ok, fail, handleApiError } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { canAccessObra } from '@/lib/auth/access';

export const runtime = 'nodejs';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const auth = await requireApiPermission(req, PERMISSIONS.ENG_PES_VIEW);
    if (!auth.granted) return fail(auth.status, auth.message);

    const { id } = await params;

    const [rows]: any = await db.query(
      `SELECT id, id_obra as idObra, nome, tipo, dados, created_at as createdAt, updated_at as updatedAt 
       FROM engenharia_pes_cenarios 
       WHERE id = ? AND tenant_id = ?`,
      [id, auth.tenant.id]
    );

    if (!rows.length) return fail(404, 'Cenário não encontrado.');

    const cenario = rows[0];
    const hasAccess = await canAccessObra(auth.user.id, cenario.idObra);
    if (!hasAccess) return fail(403, 'Acesso negado a esta obra.');

    return ok({
      ...cenario,
      dados: typeof cenario.dados === 'string' ? JSON.parse(cenario.dados) : cenario.dados
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const auth = await requireApiPermission(req, PERMISSIONS.ENG_PES_EDIT);
    if (!auth.granted) return fail(auth.status, auth.message);

    const { id } = await params;

    const [rows]: any = await db.query(
      `SELECT id_obra as idObra FROM engenharia_pes_cenarios WHERE id = ? AND tenant_id = ?`,
      [id, auth.tenant.id]
    );

    if (!rows.length) return fail(404, 'Cenário não encontrado.');

    const hasAccess = await canAccessObra(auth.user.id, rows[0].idObra);
    if (!hasAccess) return fail(403, 'Acesso negado a esta obra.');

    await db.query(`DELETE FROM engenharia_pes_cenarios WHERE id = ? AND tenant_id = ?`, [id, auth.tenant.id]);

    return ok({ message: 'Cenário excluído com sucesso.' });
  } catch (error) {
    return handleApiError(error);
  }
}
