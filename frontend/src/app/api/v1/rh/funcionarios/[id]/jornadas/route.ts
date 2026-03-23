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
    const tipoJornada = String(body?.tipoJornada || '').trim();
    const horasSemanais = Number(body?.horasSemanais);
    const horaEntrada = body?.horaEntrada ? String(body.horaEntrada) : null;
    const horaSaida = body?.horaSaida ? String(body.horaSaida) : null;
    const intervaloMinutos = Number(body?.intervaloMinutos ?? 60);
    const bancoHorasAtivo = Boolean(body?.bancoHorasAtivo);
    const dataInicio = String(body?.dataInicio || '').trim();
    const observacao = body?.observacao ? String(body.observacao).trim() : null;

    if (!tipoJornada) throw new ApiError(422, 'Tipo de jornada obrigatório');
    if (!Number.isFinite(horasSemanais) || horasSemanais <= 0) throw new ApiError(422, 'Horas semanais obrigatórias');
    if (!dataInicio) throw new ApiError(422, 'Data de início obrigatória');

    const [[funcionario]]: any = await conn.query(`SELECT id_funcionario FROM funcionarios WHERE tenant_id = ? AND id_funcionario = ?`, [
      user.tenantId,
      idFuncionario,
    ]);
    if (!funcionario) throw new ApiError(404, 'Funcionário não encontrado.');

    await conn.beginTransaction();
    await conn.execute(`UPDATE funcionarios_jornadas SET atual = 0, data_fim = CURDATE() WHERE id_funcionario = ? AND atual = 1`, [idFuncionario]);

    const [result]: any = await conn.execute(
      `
      INSERT INTO funcionarios_jornadas
        (id_funcionario, tipo_jornada, horas_semanais, hora_entrada, hora_saida, intervalo_minutos, banco_horas_ativo, data_inicio, data_fim, atual, observacao)
      VALUES
        (?, ?, ?, ?, ?, ?, ?, ?, NULL, 1, ?)
      `,
      [idFuncionario, tipoJornada, horasSemanais, horaEntrada, horaSaida, intervaloMinutos, bancoHorasAtivo ? 1 : 0, dataInicio, observacao]
    );

    await audit({
      tenantId: user.tenantId,
      userId: user.id,
      entidade: 'funcionarios_jornadas',
      idRegistro: String(result.insertId),
      acao: 'CREATE',
      dadosNovos: { idFuncionario, tipoJornada, horasSemanais, horaEntrada, horaSaida, intervaloMinutos, bancoHorasAtivo, dataInicio, observacao },
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
