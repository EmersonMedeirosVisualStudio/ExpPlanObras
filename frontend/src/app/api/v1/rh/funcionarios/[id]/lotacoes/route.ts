import { db } from '@/lib/db';
import { audit } from '@/lib/api/audit';
import { ApiError, created, handleApiError } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { PERMISSIONS } from '@/lib/auth/permissions';

export const runtime = 'nodejs';

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  const conn = await db.getConnection();
  try {
    const user = await requireApiPermission(PERMISSIONS.RH_FUNCIONARIOS_CRUD);
    const { id } = await context.params;
    const idFuncionario = Number(id);
    if (!Number.isFinite(idFuncionario)) throw new ApiError(400, 'ID inválido.');

    const body = await req.json();
    const tipoLotacao = String(body?.tipoLotacao || '').toUpperCase();
    const idObra = body?.idObra === null || body?.idObra === undefined ? null : Number(body.idObra);
    const idUnidade = body?.idUnidade === null || body?.idUnidade === undefined ? null : Number(body.idUnidade);
    const dataInicio = String(body?.dataInicio || '').trim();
    const observacao = body?.observacao ? String(body.observacao).trim() : null;

    if (!['OBRA', 'UNIDADE'].includes(tipoLotacao)) throw new ApiError(422, 'Tipo de lotação obrigatório');
    if (!dataInicio) throw new ApiError(422, 'Data de início obrigatória');
    if (tipoLotacao === 'OBRA' && (!idObra || !Number.isFinite(idObra))) throw new ApiError(422, 'Informe a obra');
    if (tipoLotacao === 'UNIDADE' && (!idUnidade || !Number.isFinite(idUnidade))) throw new ApiError(422, 'Informe a unidade');

    const [[funcionario]]: any = await conn.query(`SELECT id_funcionario FROM funcionarios WHERE tenant_id = ? AND id_funcionario = ?`, [
      user.tenantId,
      idFuncionario,
    ]);
    if (!funcionario) throw new ApiError(404, 'Funcionário não encontrado.');

    await conn.beginTransaction();
    await conn.execute(`UPDATE funcionarios_lotacoes SET atual = 0, data_fim = CURDATE() WHERE id_funcionario = ? AND atual = 1`, [idFuncionario]);

    const [result]: any = await conn.execute(
      `
      INSERT INTO funcionarios_lotacoes
        (id_funcionario, tipo_lotacao, id_obra, id_unidade, data_inicio, data_fim, atual, observacao)
      VALUES
        (?, ?, ?, ?, ?, NULL, 1, ?)
      `,
      [idFuncionario, tipoLotacao, tipoLotacao === 'OBRA' ? idObra : null, tipoLotacao === 'UNIDADE' ? idUnidade : null, dataInicio, observacao]
    );

    await audit({
      tenantId: user.tenantId,
      userId: user.id,
      entidade: 'funcionarios_lotacoes',
      idRegistro: String(result.insertId),
      acao: 'CREATE',
      dadosNovos: { idFuncionario, tipoLotacao, idObra, idUnidade, dataInicio, observacao },
    });

    await conn.commit();
    return created({ id: result.insertId });
  } catch (error) {
    await conn.rollback();
    return handleApiError(error);
  } finally {
    conn.release();
  }
}
