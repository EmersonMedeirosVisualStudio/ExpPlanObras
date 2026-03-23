import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { ok, fail, handleApiError } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { PERMISSIONS } from '@/lib/auth/permissions';

export const runtime = 'nodejs';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const current = await requireApiPermission(PERMISSIONS.SST_CHECKLISTS_VIEW);
    const { id: idStr } = await params;
    const id = Number(idStr);

    const [headRows]: any = await db.query(
      `
      SELECT
        e.id_execucao_checklist AS id,
        e.id_modelo_checklist AS idModeloChecklist,
        m.nome_modelo AS nomeModelo,
        e.tipo_local AS tipoLocal,
        e.id_obra AS idObra,
        e.id_unidade AS idUnidade,
        e.data_referencia AS dataReferencia,
        e.status_execucao AS statusExecucao,
        e.abrange_terceirizados AS abrangeTerceirizados,
        e.id_assinatura_executor AS idAssinaturaExecutor,
        e.observacao
      FROM sst_checklists_execucoes e
      INNER JOIN sst_checklists_modelos m ON m.id_modelo_checklist = e.id_modelo_checklist
      WHERE e.id_execucao_checklist = ? AND e.tenant_id = ?
      `,
      [id, current.tenantId]
    );
    if (!headRows.length) return fail(404, 'Execução não encontrada');

    const [itens]: any = await db.query(
      `
      SELECT
        mi.id_modelo_item AS idModeloItem,
        mi.ordem_item AS ordemItem,
        mi.grupo_item AS grupoItem,
        mi.descricao_item AS descricaoItem,
        mi.tipo_resposta AS tipoResposta,
        mi.obrigatorio,
        mi.gera_nc_quando_reprovado AS geraNcQuandoReprovado,
        ei.id_execucao_item AS idExecucaoItem,
        ei.resposta_valor AS respostaValor,
        ei.conforme_flag AS conformeFlag,
        ei.observacao,
        ei.gera_nc AS geraNc
      FROM sst_checklists_modelos_itens mi
      LEFT JOIN sst_checklists_execucoes_itens ei
        ON ei.id_modelo_item = mi.id_modelo_item
       AND ei.id_execucao_checklist = ?
      WHERE mi.id_modelo_checklist = ? AND mi.ativo = 1
      ORDER BY mi.ordem_item, mi.id_modelo_item
      `,
      [id, headRows[0].idModeloChecklist]
    );

    return ok({ ...headRows[0], itens });
  } catch (e) {
    return handleApiError(e);
  }
}
