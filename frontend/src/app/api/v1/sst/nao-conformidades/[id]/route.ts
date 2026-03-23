import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { ok, fail, handleApiError } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { PERMISSIONS } from '@/lib/auth/permissions';

export const runtime = 'nodejs';

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const current = await requireApiPermission(PERMISSIONS.SST_NC_VIEW);
    const id = Number(params.id);

    const [ncRows]: any = await db.query(
      `
      SELECT id_nc AS id,
             codigo_nc AS codigoNc,
             tipo_local AS tipoLocal,
             id_obra AS idObra,
             id_unidade AS idUnidade,
             origem_tipo AS origemTipo,
             titulo,
             descricao,
             severidade,
             risco_potencial AS riscoPotencial,
             status_nc AS statusNc,
             exige_interdicao AS exigeInterdicao,
             interdicao_aplicada AS interdicaoAplicada,
             envolve_terceirizada AS envolveTerceirizada,
             id_empresa_parceira AS idEmpresaParceira,
             data_identificacao AS dataIdentificacao,
             prazo_correcao AS prazoCorrecao,
             observacao
      FROM sst_nao_conformidades
      WHERE id_nc = ? AND tenant_id = ?
      `,
      [id, current.tenantId]
    );

    if (!ncRows.length) return fail(404, 'Não conformidade não encontrada');

    const [acoes]: any = await db.query(
      `
      SELECT a.id_nc_acao AS id,
             a.id_nc AS idNc,
             a.ordem_acao AS ordemAcao,
             a.descricao_acao AS descricaoAcao,
             a.tipo_responsavel AS tipoResponsavel,
             a.id_responsavel_funcionario AS idResponsavelFuncionario,
             a.id_empresa_parceira AS idEmpresaParceira,
             a.id_terceirizado_trabalhador AS idTerceirizadoTrabalhador,
             a.prazo_acao AS prazoAcao,
             a.status_acao AS statusAcao,
             a.data_conclusao AS dataConclusao,
             a.observacao_execucao AS observacaoExecucao
      FROM sst_nao_conformidades_acoes a
      WHERE a.id_nc = ?
      ORDER BY a.ordem_acao, a.id_nc_acao
      `,
      [id]
    );

    return ok({ ...ncRows[0], acoes });
  } catch (e) {
    return handleApiError(e);
  }
}

