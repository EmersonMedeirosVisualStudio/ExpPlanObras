import { db } from '@/lib/db';
import { audit } from '@/lib/api/audit';
import { ApiError, created, handleApiError, ok } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { PERMISSIONS } from '@/lib/auth/permissions';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  try {
    const user = await requireApiPermission(PERMISSIONS.RH_HORAS_EXTRAS_VIEW);
    const { searchParams } = new URL(req.url);
    const idFuncionario = searchParams.get('idFuncionario');
    const limite = Math.min(100, Math.max(1, Number(searchParams.get('limite') || 50)));

    const where: string[] = ['he.tenant_id = ?'];
    const params: any[] = [user.tenantId];

    if (idFuncionario) {
      const n = Number(idFuncionario);
      if (!Number.isFinite(n)) throw new ApiError(400, 'idFuncionario inválido.');
      where.push('he.id_funcionario = ?');
      params.push(n);
    }

    const [rows]: any = await db.query(
      `
      SELECT
        he.id_hora_extra id,
        he.id_funcionario idFuncionario,
        f.nome_completo funcionarioNome,
        he.data_referencia dataReferencia,
        he.quantidade_minutos quantidadeMinutos,
        he.tipo_hora_extra tipoHoraExtra,
        he.motivo,
        he.status_he statusHe,
        he.id_obra idObra,
        he.id_unidade idUnidade,
        he.observacao
      FROM funcionarios_horas_extras he
      INNER JOIN funcionarios f ON f.id_funcionario = he.id_funcionario
      WHERE ${where.join(' AND ')}
      ORDER BY he.data_referencia DESC, he.id_hora_extra DESC
      LIMIT ?
      `,
      [...params, limite]
    );

    return ok(rows, undefined, { limite });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireApiPermission(PERMISSIONS.RH_HORAS_EXTRAS_CRUD);
    const body = await req.json();

    const idFuncionario = Number(body?.idFuncionario);
    const dataReferencia = String(body?.dataReferencia || '').trim();
    const quantidadeMinutos = Number(body?.quantidadeMinutos);
    const tipoHoraExtra = String(body?.tipoHoraExtra || '').trim();
    const motivo = body?.motivo ? String(body.motivo) : null;
    const idObra = body?.idObra === null || body?.idObra === undefined ? null : Number(body.idObra);
    const idUnidade = body?.idUnidade === null || body?.idUnidade === undefined ? null : Number(body.idUnidade);
    const observacao = body?.observacao ? String(body.observacao) : null;

    if (!Number.isFinite(idFuncionario)) throw new ApiError(400, 'idFuncionario é obrigatório.');
    if (!dataReferencia) throw new ApiError(400, 'dataReferencia é obrigatório.');
    if (!Number.isFinite(quantidadeMinutos) || quantidadeMinutos <= 0) throw new ApiError(400, 'quantidadeMinutos inválido.');
    if (!tipoHoraExtra) throw new ApiError(400, 'tipoHoraExtra é obrigatório.');

    const [[funcionario]]: any = await db.query(`SELECT id_funcionario FROM funcionarios WHERE tenant_id = ? AND id_funcionario = ?`, [
      user.tenantId,
      idFuncionario,
    ]);
    if (!funcionario) throw new ApiError(404, 'Funcionário não encontrado.');

    const [result]: any = await db.execute(
      `
      INSERT INTO funcionarios_horas_extras
        (tenant_id, id_funcionario, data_referencia, quantidade_minutos, tipo_hora_extra, motivo, status_he, id_obra, id_unidade, observacao)
      VALUES
        (?, ?, ?, ?, ?, ?, 'SOLICITADA', ?, ?, ?)
      `,
      [user.tenantId, idFuncionario, dataReferencia, quantidadeMinutos, tipoHoraExtra, motivo, idObra, idUnidade, observacao]
    );

    await audit({
      tenantId: user.tenantId,
      userId: user.id,
      entidade: 'funcionarios_horas_extras',
      idRegistro: String(result.insertId),
      acao: 'CREATE',
      dadosNovos: { idFuncionario, dataReferencia, quantidadeMinutos, tipoHoraExtra, motivo, idObra, idUnidade, observacao },
    });

    return created({ id: result.insertId });
  } catch (error) {
    return handleApiError(error);
  }
}
