import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { created, fail, handleApiError } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { PERMISSIONS } from '@/lib/auth/permissions';

export const runtime = 'nodejs';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const conn = await db.getConnection();
  try {
    const current = await requireApiPermission(PERMISSIONS.SST_TECNICOS_CRUD);
    const idProfissional = Number(params.id);
    const body = await req.json();

    if (!body.tipoLocal || !body.dataInicio) return fail(422, 'Tipo local e data são obrigatórios');
    if (body.tipoLocal === 'OBRA' && !body.idObra) return fail(422, 'Informe a obra');
    if (body.tipoLocal === 'UNIDADE' && !body.idUnidade) return fail(422, 'Informe a unidade');

    const [[prof]]: any = await conn.query(`SELECT id_sst_profissional FROM sst_profissionais WHERE id_sst_profissional = ? AND tenant_id = ?`, [
      idProfissional,
      current.tenantId,
    ]);
    if (!prof) return fail(404, 'Profissional não encontrado');

    await conn.beginTransaction();

    if (body.principal) {
      await conn.query(`UPDATE sst_profissionais_alocacoes SET principal = 0 WHERE id_sst_profissional = ? AND atual = 1`, [idProfissional]);
    }

    const [result]: any = await conn.query(
      `
      INSERT INTO sst_profissionais_alocacoes
      (id_sst_profissional, tipo_local, id_obra, id_unidade, data_inicio, atual, principal, observacao)
      VALUES (?, ?, ?, ?, ?, 1, ?, ?)
      `,
      [idProfissional, body.tipoLocal, body.idObra || null, body.idUnidade || null, body.dataInicio, body.principal ? 1 : 0, body.observacao || null]
    );

    await conn.commit();
    return created({ id: result.insertId });
  } catch (e) {
    await conn.rollback();
    return handleApiError(e);
  } finally {
    conn.release();
  }
}
