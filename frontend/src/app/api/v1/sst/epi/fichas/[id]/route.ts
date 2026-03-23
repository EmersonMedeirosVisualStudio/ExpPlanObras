import { db } from '@/lib/db';
import { ApiError, handleApiError, ok } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { PERMISSIONS } from '@/lib/auth/permissions';

export const runtime = 'nodejs';

export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const current = await requireApiPermission(PERMISSIONS.SST_EPI_VIEW);
    const { id } = await context.params;
    const idFicha = Number(id);
    if (!Number.isFinite(idFicha)) throw new ApiError(400, 'ID inválido');

    const [[cabecalho]]: any = await db.query(
      `
      SELECT
        f.id_ficha_epi id,
        f.tipo_destinatario tipoDestinatario,
        f.id_funcionario idFuncionario,
        f.id_terceirizado_trabalhador idTerceirizadoTrabalhador,
        COALESCE(func.nome_completo, terc.nome_completo) destinatarioNome,
        f.tipo_local tipoLocal,
        f.id_obra idObra,
        f.id_unidade idUnidade,
        f.status_ficha statusFicha,
        f.data_emissao dataEmissao,
        f.entrega_orientada entregaOrientada,
        f.assinatura_destinatario_obrigatoria assinaturaDestinatarioObrigatoria,
        f.id_assinatura_destinatario idAssinaturaDestinatario,
        f.observacao
      FROM sst_epi_fichas f
      LEFT JOIN funcionarios func ON func.id_funcionario = f.id_funcionario
      LEFT JOIN terceirizados_trabalhadores terc ON terc.id_terceirizado_trabalhador = f.id_terceirizado_trabalhador
      WHERE f.tenant_id = ? AND f.id_ficha_epi = ?
      LIMIT 1
      `,
      [current.tenantId, idFicha]
    );
    if (!cabecalho) throw new ApiError(404, 'Ficha não encontrada');

    const [itens]: any = await db.query(
      `
      SELECT
        i.id_ficha_epi_item id,
        i.id_epi idEpi,
        e.nome_epi nomeEpi,
        e.categoria_epi categoriaEpi,
        e.ca_numero caNumero,
        e.ca_validade caValidade,
        i.quantidade_entregue quantidadeEntregue,
        i.tamanho,
        i.data_entrega dataEntrega,
        i.data_prevista_troca dataPrevistaTroca,
        i.status_item statusItem,
        i.data_devolucao dataDevolucao,
        i.quantidade_devolvida quantidadeDevolvida,
        i.condicao_devolucao condicaoDevolucao,
        i.higienizado higienizado,
        i.motivo_movimentacao motivoMovimentacao,
        i.id_assinatura_entrega idAssinaturaEntrega,
        i.id_assinatura_devolucao idAssinaturaDevolucao,
        i.observacao
      FROM sst_epi_fichas_itens i
      INNER JOIN sst_epi_catalogo e ON e.id_epi = i.id_epi
      WHERE i.id_ficha_epi = ?
      ORDER BY i.data_entrega DESC, i.id_ficha_epi_item DESC
      `,
      [idFicha]
    );

    return ok({ ...cabecalho, itens });
  } catch (e) {
    return handleApiError(e);
  }
}

