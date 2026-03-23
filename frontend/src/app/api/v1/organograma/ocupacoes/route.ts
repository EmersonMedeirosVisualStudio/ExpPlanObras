import { db } from '@/lib/db';
import { audit } from '@/lib/api/audit';
import { ApiError, created, handleApiError } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { PERMISSIONS } from '@/lib/auth/permissions';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const conn = await db.getConnection();
  try {
    const current = await requireApiPermission(PERMISSIONS.ORGANOGRAMA_CRUD);
    const body = await req.json();

    if (!body.idFuncionario || !body.idPosicao || !body.dataInicio) {
      throw new ApiError(422, 'Funcionário, posição e data de início são obrigatórios');
    }

    const idFuncionario = Number(body.idFuncionario);
    const idPosicao = Number(body.idPosicao);
    const dataInicio = String(body.dataInicio);

    const [[funcionario]]: any = await conn.query(`SELECT id_funcionario FROM funcionarios WHERE id_funcionario = ? AND tenant_id = ?`, [
      idFuncionario,
      current.tenantId,
    ]);
    if (!funcionario) throw new ApiError(404, 'Funcionário não encontrado');

    const [[posicao]]: any = await conn.query(`SELECT id_posicao FROM organograma_posicoes WHERE id_posicao = ? AND tenant_id = ?`, [
      idPosicao,
      current.tenantId,
    ]);
    if (!posicao) throw new ApiError(404, 'Posição não encontrada');

    await conn.beginTransaction();

    await conn.query(
      `
      UPDATE funcionarios_posicoes fp
      INNER JOIN organograma_posicoes p ON p.id_posicao = fp.id_posicao
      SET fp.vigente = 0, fp.data_fim = CURDATE()
      WHERE (fp.id_funcionario = ? OR fp.id_posicao = ?) AND fp.vigente = 1 AND p.tenant_id = ?
      `,
      [idFuncionario, idPosicao, current.tenantId]
    );

    const [result]: any = await conn.query(
      `
      INSERT INTO funcionarios_posicoes (id_funcionario, id_posicao, data_inicio, vigente)
      VALUES (?, ?, ?, 1)
      `,
      [idFuncionario, idPosicao, dataInicio]
    );

    const [rows]: any = await conn.query(
      `
      SELECT fp.id_funcionario_posicao AS id,
             fp.id_funcionario AS idFuncionario,
             fp.id_posicao AS idPosicao,
             f.nome_completo AS funcionarioNome,
             fp.data_inicio AS dataInicio,
             fp.data_fim AS dataFim,
             fp.vigente
      FROM funcionarios_posicoes fp
      INNER JOIN funcionarios f ON f.id_funcionario = fp.id_funcionario
      WHERE fp.id_funcionario_posicao = ?
      `,
      [result.insertId]
    );

    await audit({
      tenantId: current.tenantId,
      userId: current.id,
      entidade: 'funcionarios_posicoes',
      idRegistro: String(result.insertId),
      acao: 'OCUPAR_POSICAO',
      dadosNovos: { idFuncionario, idPosicao, dataInicio },
    });

    await conn.commit();
    return created(rows[0]);
  } catch (error) {
    await conn.rollback();
    return handleApiError(error);
  } finally {
    conn.release();
  }
}
