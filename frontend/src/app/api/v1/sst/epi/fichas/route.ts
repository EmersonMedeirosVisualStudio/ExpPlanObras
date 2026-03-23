import { db } from '@/lib/db';
import { ApiError, created, fail, handleApiError, ok } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { PERMISSIONS } from '@/lib/auth/permissions';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  try {
    const current = await requireApiPermission(PERMISSIONS.SST_EPI_VIEW);
    const [rows]: any = await db.query(
      `
      SELECT
        f.id_ficha_epi id,
        f.tipo_destinatario tipoDestinatario,
        f.id_funcionario idFuncionario,
        f.id_terceirizado_trabalhador idTerceirizadoTrabalhador,
        f.tipo_local tipoLocal,
        f.id_obra idObra,
        f.id_unidade idUnidade,
        f.status_ficha statusFicha,
        f.data_emissao dataEmissao,
        COALESCE(func.nome_completo, terc.nome_completo) destinatarioNome
      FROM sst_epi_fichas f
      LEFT JOIN funcionarios func ON func.id_funcionario = f.id_funcionario
      LEFT JOIN terceirizados_trabalhadores terc ON terc.id_terceirizado_trabalhador = f.id_terceirizado_trabalhador
      WHERE f.tenant_id = ?
      ORDER BY f.id_ficha_epi DESC
      `,
      [current.tenantId]
    );

    return ok(rows);
  } catch (e) {
    return handleApiError(e);
  }
}

export async function POST(req: Request) {
  try {
    const current = await requireApiPermission(PERMISSIONS.SST_EPI_CRUD);
    const body = await req.json();

    const tipoDestinatario = String(body?.tipoDestinatario || '').toUpperCase();
    const tipoLocal = String(body?.tipoLocal || '').toUpperCase();
    const idFuncionario = body?.idFuncionario ? Number(body.idFuncionario) : null;
    const idTerceirizadoTrabalhador = body?.idTerceirizadoTrabalhador ? Number(body.idTerceirizadoTrabalhador) : null;
    const idObra = body?.idObra === null || body?.idObra === undefined ? null : Number(body.idObra);
    const idUnidade = body?.idUnidade === null || body?.idUnidade === undefined ? null : Number(body.idUnidade);
    const dataEmissao = String(body?.dataEmissao || '').trim();
    const entregaOrientada = body?.entregaOrientada ? 1 : 0;
    const assinaturaDestinatarioObrigatoria = body?.assinaturaDestinatarioObrigatoria ? 1 : 0;
    const observacao = body?.observacao ? String(body.observacao).trim() : null;

    if (!tipoDestinatario || !tipoLocal || !dataEmissao) {
      return fail(422, 'Destinatário, local e data são obrigatórios');
    }
    if (tipoDestinatario === 'FUNCIONARIO' && !idFuncionario) return fail(422, 'Funcionário obrigatório');
    if (tipoDestinatario === 'TERCEIRIZADO' && !idTerceirizadoTrabalhador) return fail(422, 'Trabalhador terceirizado obrigatório');
    if (!['FUNCIONARIO', 'TERCEIRIZADO'].includes(tipoDestinatario)) throw new ApiError(422, 'tipoDestinatario inválido');
    if (!['OBRA', 'UNIDADE'].includes(tipoLocal)) throw new ApiError(422, 'tipoLocal inválido');
    if (tipoLocal === 'OBRA' && !Number.isFinite(idObra)) throw new ApiError(422, 'idObra é obrigatório');
    if (tipoLocal === 'UNIDADE' && !Number.isFinite(idUnidade)) throw new ApiError(422, 'idUnidade é obrigatório');

    if (tipoDestinatario === 'FUNCIONARIO') {
      if (!Number.isFinite(idFuncionario)) throw new ApiError(422, 'idFuncionario é obrigatório');
      const [[funcionario]]: any = await db.query(
        `SELECT id_funcionario FROM funcionarios WHERE tenant_id = ? AND id_funcionario = ? AND ativo = 1 LIMIT 1`,
        [current.tenantId, idFuncionario]
      );
      if (!funcionario) throw new ApiError(404, 'Funcionário não encontrado');

      const [[lot]]: any = await db.query(
        `
        SELECT id_lotacao
        FROM funcionarios_lotacoes
        WHERE id_funcionario = ?
          AND atual = 1
          AND (
            (? = 'OBRA' AND tipo_lotacao = 'OBRA' AND id_obra = ?)
            OR
            (? = 'UNIDADE' AND tipo_lotacao = 'UNIDADE' AND id_unidade = ?)
          )
        LIMIT 1
        `,
        [idFuncionario, tipoLocal, idObra || 0, tipoLocal, idUnidade || 0]
      );
      if (!lot) throw new ApiError(422, 'Funcionário sem lotação ativa no local');
    } else {
      if (!Number.isFinite(idTerceirizadoTrabalhador)) throw new ApiError(422, 'idTerceirizadoTrabalhador é obrigatório');
      const [[terc]]: any = await db.query(
        `SELECT id_terceirizado_trabalhador FROM terceirizados_trabalhadores WHERE tenant_id = ? AND id_terceirizado_trabalhador = ? AND ativo = 1 LIMIT 1`,
        [current.tenantId, idTerceirizadoTrabalhador]
      );
      if (!terc) throw new ApiError(404, 'Terceirizado não encontrado');

      const [[aloc]]: any = await db.query(
        `
        SELECT id_alocacao
        FROM terceirizados_alocacoes
        WHERE id_terceirizado_trabalhador = ?
          AND atual = 1
          AND (
            (? = 'OBRA' AND tipo_local = 'OBRA' AND id_obra = ?)
            OR
            (? = 'UNIDADE' AND tipo_local = 'UNIDADE' AND id_unidade = ?)
          )
        LIMIT 1
        `,
        [idTerceirizadoTrabalhador, tipoLocal, idObra || 0, tipoLocal, idUnidade || 0]
      );
      if (!aloc) throw new ApiError(422, 'Terceirizado sem alocação ativa no local');
    }

    const [result]: any = await db.query(
      `
      INSERT INTO sst_epi_fichas
        (tenant_id, tipo_destinatario, id_funcionario, id_terceirizado_trabalhador,
         tipo_local, id_obra, id_unidade, status_ficha, data_emissao,
         entrega_orientada, assinatura_destinatario_obrigatoria, id_responsavel_lancamento_usuario, observacao)
      VALUES
        (?, ?, ?, ?, ?, ?, ?, 'EM_PREENCHIMENTO', ?, ?, ?, ?, ?)
      `,
      [
        current.tenantId,
        tipoDestinatario,
        idFuncionario,
        idTerceirizadoTrabalhador,
        tipoLocal,
        idObra,
        idUnidade,
        dataEmissao,
        entregaOrientada,
        assinaturaDestinatarioObrigatoria,
        current.id,
        observacao,
      ]
    );

    return created({ id: result.insertId });
  } catch (e) {
    return handleApiError(e);
  }
}
