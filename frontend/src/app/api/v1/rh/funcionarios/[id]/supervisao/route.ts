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
    const idSupervisorFuncionario = Number(body?.idSupervisorFuncionario);
    const dataInicio = String(body?.dataInicio || '').trim();
    const observacao = body?.observacao ? String(body.observacao).trim() : null;

    if (!Number.isFinite(idSupervisorFuncionario)) throw new ApiError(422, 'Supervisor obrigatório');
    if (!dataInicio) throw new ApiError(422, 'Data de início obrigatória');
    if (idSupervisorFuncionario === idFuncionario) throw new ApiError(422, 'Funcionário não pode supervisionar a si mesmo');

    const [[funcionario]]: any = await conn.query(`SELECT id_funcionario FROM funcionarios WHERE tenant_id = ? AND id_funcionario = ?`, [
      user.tenantId,
      idFuncionario,
    ]);
    if (!funcionario) throw new ApiError(404, 'Funcionário não encontrado.');

    const [[supervisor]]: any = await conn.query(`SELECT id_funcionario FROM funcionarios WHERE tenant_id = ? AND id_funcionario = ?`, [
      user.tenantId,
      idSupervisorFuncionario,
    ]);
    if (!supervisor) throw new ApiError(404, 'Supervisor não encontrado.');

    await conn.beginTransaction();
    await conn.execute(`UPDATE funcionarios_supervisao SET atual = 0, data_fim = CURDATE() WHERE id_funcionario = ? AND atual = 1`, [idFuncionario]);

    const [result]: any = await conn.execute(
      `
      INSERT INTO funcionarios_supervisao
        (id_funcionario, id_supervisor_funcionario, data_inicio, data_fim, atual, observacao)
      VALUES
        (?, ?, ?, NULL, 1, ?)
      `,
      [idFuncionario, idSupervisorFuncionario, dataInicio, observacao]
    );

    await audit({
      tenantId: user.tenantId,
      userId: user.id,
      entidade: 'funcionarios_supervisao',
      idRegistro: String(result.insertId),
      acao: 'CREATE',
      dadosNovos: { idFuncionario, idSupervisorFuncionario, dataInicio, observacao },
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
