import { db } from '@/lib/db';
import { audit } from '@/lib/api/audit';
import { ApiError, created, handleApiError } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { PERMISSIONS } from '@/lib/auth/permissions';

export const runtime = 'nodejs';

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  const conn = await db.getConnection();
  try {
    const current = await requireApiPermission(PERMISSIONS.RH_FUNCIONARIOS_CRUD);
    const { id } = await context.params;
    const idTerceirizado = Number(id);
    if (!Number.isFinite(idTerceirizado)) throw new ApiError(400, 'ID inválido.');

    const body = await req.json();
    const tipoLocal = String(body?.tipoLocal || '').toUpperCase();
    const idObra = body?.idObra === null || body?.idObra === undefined ? null : Number(body.idObra);
    const idUnidade = body?.idUnidade === null || body?.idUnidade === undefined ? null : Number(body.idUnidade);
    const dataInicio = String(body?.dataInicio || '').trim();
    const observacao = body?.observacao ? String(body.observacao).trim() : null;

    if (!['OBRA', 'UNIDADE'].includes(tipoLocal)) throw new ApiError(422, 'Tipo de alocação obrigatório');
    if (!dataInicio) throw new ApiError(422, 'Data de início obrigatória');
    if (tipoLocal === 'OBRA' && (!idObra || !Number.isFinite(idObra))) throw new ApiError(422, 'Informe a obra');
    if (tipoLocal === 'UNIDADE' && (!idUnidade || !Number.isFinite(idUnidade))) throw new ApiError(422, 'Informe a unidade');

    const [[terceirizado]]: any = await conn.query(
      `SELECT id_terceirizado_trabalhador FROM terceirizados_trabalhadores WHERE tenant_id = ? AND id_terceirizado_trabalhador = ?`,
      [current.tenantId, idTerceirizado]
    );
    if (!terceirizado) throw new ApiError(404, 'Terceirizado não encontrado.');

    let cols: Set<string> | null = null;
    try {
      const [colRows]: any = await conn.query(
        `SELECT COLUMN_NAME columnName FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'terceirizados_alocacoes'`
      );
      cols = new Set<string>((Array.isArray(colRows) ? colRows : []).map((r: any) => String(r.columnName || r.COLUMN_NAME || '')));
    } catch {
      cols = null;
    }

    const hasDataFim = !!cols?.has('data_fim');
    const hasDataInicio = !!cols?.has('data_inicio');
    const hasObservacao = !!cols?.has('observacao');

    await conn.beginTransaction();

    const updateParts: string[] = [`atual = 0`];
    if (hasDataFim) updateParts.push(`data_fim = CURDATE()`);
    await conn.execute(
      `UPDATE terceirizados_alocacoes SET ${updateParts.join(', ')} WHERE tenant_id = ? AND id_terceirizado_trabalhador = ? AND atual = 1`,
      [current.tenantId, idTerceirizado]
    );

    const insertCols: string[] = ['tenant_id', 'id_terceirizado_trabalhador', 'tipo_local', 'id_obra', 'id_unidade', 'atual'];
    const insertVals: any[] = [
      current.tenantId,
      idTerceirizado,
      tipoLocal,
      tipoLocal === 'OBRA' ? idObra : null,
      tipoLocal === 'UNIDADE' ? idUnidade : null,
      1,
    ];
    if (hasDataInicio) {
      insertCols.push('data_inicio');
      insertVals.push(dataInicio);
    }
    if (hasDataFim) {
      insertCols.push('data_fim');
      insertVals.push(null);
    }
    if (hasObservacao) {
      insertCols.push('observacao');
      insertVals.push(observacao);
    }

    const placeholders = insertCols.map(() => '?').join(', ');
    const [result]: any = await conn.execute(
      `INSERT INTO terceirizados_alocacoes (${insertCols.join(', ')}) VALUES (${placeholders})`,
      insertVals
    );

    await audit({
      tenantId: current.tenantId,
      userId: current.id,
      entidade: 'terceirizados_alocacoes',
      idRegistro: String(result.insertId),
      acao: 'CREATE',
      dadosNovos: { idTerceirizado, tipoLocal, idObra, idUnidade, dataInicio, observacao },
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

