import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { ok, created, fail, handleApiError } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { PERMISSIONS } from '@/lib/auth/permissions';

export const runtime = 'nodejs';

export async function GET(_req: NextRequest) {
  try {
    const current = await requireApiPermission(PERMISSIONS.SST_TREINAMENTOS_VIEW);
    const [rows]: any = await db.query(
      `
      SELECT
        t.id_treinamento_turma id,
        t.id_treinamento_modelo idTreinamentoModelo,
        m.nome_treinamento nomeTreinamento,
        t.tipo_local tipoLocal,
        t.id_obra idObra,
        t.id_unidade idUnidade,
        t.data_inicio dataInicio,
        t.data_fim dataFim,
        t.status_turma statusTurma,
        t.tipo_instrutor tipoInstrutor,
        t.id_instrutor_funcionario idInstrutorFuncionario,
        t.nome_instrutor_externo nomeInstrutorExterno
      FROM sst_treinamentos_turmas t
      INNER JOIN sst_treinamentos_modelos m ON m.id_treinamento_modelo = t.id_treinamento_modelo
      WHERE t.tenant_id = ?
      ORDER BY t.data_inicio DESC, t.id_treinamento_turma DESC
      `,
      [current.tenantId]
    );
    return ok(rows);
  } catch (e) {
    return handleApiError(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const current = await requireApiPermission(PERMISSIONS.SST_TREINAMENTOS_EXECUTAR);
    const body = await req.json();

    if (!body.idTreinamentoModelo || !body.tipoLocal || !body.dataInicio || !body.tipoInstrutor) {
      return fail(422, 'Campos obrigatórios não informados');
    }

    const [result]: any = await db.query(
      `
      INSERT INTO sst_treinamentos_turmas
      (tenant_id, id_treinamento_modelo, tipo_local, id_obra, id_unidade,
       data_inicio, data_fim, status_turma,
       tipo_instrutor, id_instrutor_funcionario, id_empresa_parceira_instrutora, nome_instrutor_externo,
       id_usuario_responsavel, conteudo_resumido, observacao)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'EM_ELABORACAO', ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        current.tenantId,
        body.idTreinamentoModelo,
        body.tipoLocal,
        body.idObra || null,
        body.idUnidade || null,
        body.dataInicio,
        body.dataFim || null,
        body.tipoInstrutor,
        body.idInstrutorFuncionario || null,
        body.idEmpresaParceiraInstrutora || null,
        body.nomeInstrutorExterno || null,
        current.id,
        body.conteudoResumido || null,
        body.observacao || null,
      ]
    );

    return created({ id: result.insertId });
  } catch (e) {
    return handleApiError(e);
  }
}
