import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { created, fail, handleApiError } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { PERMISSIONS } from '@/lib/auth/permissions';

export const runtime = 'nodejs';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const current = await requireApiPermission(PERMISSIONS.SST_ACIDENTES_CRUD);
    const idAcidente = Number(params.id);
    const body = await req.json();

    if (!body.tipoTestemunha) return fail(422, 'Tipo da testemunha obrigatório');
    if (body.tipoTestemunha === 'FUNCIONARIO' && !body.idFuncionario) return fail(422, 'Funcionário obrigatório');
    if (body.tipoTestemunha === 'TERCEIRIZADO' && !body.idTerceirizadoTrabalhador) return fail(422, 'Terceirizado obrigatório');
    if (body.tipoTestemunha === 'EXTERNO' && !body.nomeExterno) return fail(422, 'Nome externo obrigatório');

    const [rows]: any = await db.query(`SELECT id_acidente FROM sst_acidentes WHERE id_acidente = ? AND tenant_id = ?`, [idAcidente, current.tenantId]);
    if (!rows.length) return fail(404, 'Ocorrência não encontrada');

    const [result]: any = await db.query(
      `
      INSERT INTO sst_acidentes_testemunhas
      (id_acidente, tipo_testemunha, id_funcionario, id_terceirizado_trabalhador, nome_externo, contato, relato_resumido)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
      [
        idAcidente,
        body.tipoTestemunha,
        body.idFuncionario || null,
        body.idTerceirizadoTrabalhador || null,
        body.nomeExterno || null,
        body.contato || null,
        body.relatoResumido || null,
      ]
    );

    return created({ id: result.insertId });
  } catch (e) {
    return handleApiError(e);
  }
}
