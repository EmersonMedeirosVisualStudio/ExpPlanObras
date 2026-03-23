import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { ok, fail, handleApiError } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { PERMISSIONS } from '@/lib/auth/permissions';

export const runtime = 'nodejs';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const current = await requireApiPermission(PERMISSIONS.RH_PRESENCAS_VIEW);
    const id = Number(params.id);
    if (!Number.isFinite(id)) return fail(400, 'ID inválido');

    const [headRows]: any = await db.query(
      `
      SELECT
        id_presenca AS id,
        tipo_local AS tipoLocal,
        id_obra AS idObra,
        id_unidade AS idUnidade,
        data_referencia AS dataReferencia,
        turno,
        status_presenca AS statusPresenca,
        id_supervisor_lancamento AS idSupervisorLancamento,
        observacao
      FROM presencas_cabecalho
      WHERE id_presenca = ? AND tenant_id = ?
      `,
      [id, current.tenantId]
    );
    if (!headRows.length) return fail(404, 'Ficha não encontrada');

    const [itens]: any = await db.query(
      `
      SELECT
        i.id_presenca_item AS id,
        i.id_funcionario AS idFuncionario,
        f.nome_completo AS funcionarioNome,
        i.situacao_presenca AS situacaoPresenca,
        i.hora_entrada AS horaEntrada,
        i.hora_saida AS horaSaida,
        i.minutos_atraso AS minutosAtraso,
        i.minutos_hora_extra AS minutosHoraExtra,
        i.id_tarefa_planejamento AS idTarefaPlanejamento,
        i.id_subitem_orcamentario AS idSubitemOrcamentario,
        i.descricao_tarefa_dia AS descricaoTarefaDia,
        i.requer_assinatura_funcionario AS requerAssinaturaFuncionario,
        i.assinado_funcionario AS assinadoFuncionario,
        i.motivo_sem_assinatura AS motivoSemAssinatura,
        i.observacao
      FROM presencas_itens i
      INNER JOIN funcionarios f ON f.id_funcionario = i.id_funcionario
      WHERE i.id_presenca = ?
      ORDER BY f.nome_completo
      `,
      [id]
    );

    return ok({ ...headRows[0], itens });
  } catch (e) {
    return handleApiError(e);
  }
}
