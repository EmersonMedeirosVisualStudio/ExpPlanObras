import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { created, fail, handleApiError } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { PERMISSIONS } from '@/lib/auth/permissions';

export const runtime = 'nodejs';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const current = await requireApiPermission(PERMISSIONS.SST_ACIDENTES_CAT);
    const idAcidente = Number(params.id);
    const body = await req.json();

    if (!body.tipoCat || !body.dataEmissao || !body.emitidaPorTipo) return fail(422, 'Campos obrigatórios não informados');

    const [rows]: any = await db.query(`SELECT id_acidente FROM sst_acidentes WHERE id_acidente = ? AND tenant_id = ?`, [idAcidente, current.tenantId]);
    if (!rows.length) return fail(404, 'Ocorrência não encontrada');

    const [result]: any = await db.query(
      `
      INSERT INTO sst_acidentes_cat
      (id_acidente, tipo_cat, numero_cat, data_emissao, emitida_por_tipo, id_empresa_parceira, protocolo, arquivo_pdf_url, observacao, status_cat)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        idAcidente,
        body.tipoCat,
        body.numeroCat || null,
        body.dataEmissao,
        body.emitidaPorTipo,
        body.idEmpresaParceira || null,
        body.protocolo || null,
        body.arquivoPdfUrl || null,
        body.observacao || null,
        body.statusCat || 'EMITIDA',
      ]
    );

    await db.query(`UPDATE sst_acidentes SET cat_registrada = 1 WHERE id_acidente = ? AND tenant_id = ?`, [idAcidente, current.tenantId]);

    return created({ id: result.insertId });
  } catch (e) {
    return handleApiError(e);
  }
}

