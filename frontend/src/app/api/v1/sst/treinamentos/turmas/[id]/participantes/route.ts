import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { created, fail, handleApiError } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { PERMISSIONS } from '@/lib/auth/permissions';

export const runtime = 'nodejs';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const current = await requireApiPermission(PERMISSIONS.SST_TREINAMENTOS_EXECUTAR);
    const idTurma = Number(params.id);
    const body = await req.json();

    if (!body.tipoParticipante) return fail(422, 'Tipo do participante obrigatório');
    if (body.tipoParticipante === 'FUNCIONARIO' && !body.idFuncionario) return fail(422, 'Funcionário obrigatório');
    if (body.tipoParticipante === 'TERCEIRIZADO' && !body.idTerceirizadoTrabalhador) return fail(422, 'Terceirizado obrigatório');

    const [turmaRows]: any = await db.query(
      `
      SELECT t.*, m.exige_assinatura_participante
      FROM sst_treinamentos_turmas t
      INNER JOIN sst_treinamentos_modelos m ON m.id_treinamento_modelo = t.id_treinamento_modelo
      WHERE t.id_treinamento_turma = ? AND t.tenant_id = ?
      `,
      [idTurma, current.tenantId]
    );
    if (!turmaRows.length) return fail(404, 'Turma não encontrada');
    if (!['EM_ELABORACAO', 'EM_EXECUCAO'].includes(turmaRows[0].status_turma)) {
      return fail(422, 'Turma não aceita participantes');
    }

    const [result]: any = await db.query(
      `
      INSERT INTO sst_treinamentos_participantes
      (id_treinamento_turma, tipo_participante, id_funcionario, id_terceirizado_trabalhador,
       status_participacao, assinatura_obrigatoria)
      VALUES (?, ?, ?, ?, 'INSCRITO', ?)
      `,
      [
        idTurma,
        body.tipoParticipante,
        body.idFuncionario || null,
        body.idTerceirizadoTrabalhador || null,
        turmaRows[0].exige_assinatura_participante ? 1 : 0,
      ]
    );

    await db.query(
      `
      UPDATE sst_treinamentos_turmas
      SET status_turma = 'EM_EXECUCAO'
      WHERE id_treinamento_turma = ? AND tenant_id = ? AND status_turma = 'EM_ELABORACAO'
      `,
      [idTurma, current.tenantId]
    );

    return created({ id: result.insertId });
  } catch (e: any) {
    return handleApiError(e);
  }
}
