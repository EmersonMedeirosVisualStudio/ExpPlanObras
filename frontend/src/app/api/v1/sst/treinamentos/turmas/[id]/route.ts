import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { ok, fail, handleApiError } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { PERMISSIONS } from '@/lib/auth/permissions';

export const runtime = 'nodejs';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const current = await requireApiPermission(PERMISSIONS.SST_TREINAMENTOS_VIEW);
    const { id: idStr } = await params;
    const id = Number(idStr);

    const [headRows]: any = await db.query(
      `
      SELECT
        t.id_treinamento_turma id,
        t.id_treinamento_modelo idTreinamentoModelo,
        m.nome_treinamento nomeTreinamento,
        m.tipo_treinamento tipoTreinamento,
        m.validade_meses validadeMeses,
        m.antecedencia_alerta_dias antecedenciaAlertaDias,
        m.exige_assinatura_participante exigeAssinaturaParticipante,
        m.exige_assinatura_instrutor exigeAssinaturaInstrutor,
        m.exige_aprovacao exigeAprovacao,
        t.tipo_local tipoLocal,
        t.id_obra idObra,
        t.id_unidade idUnidade,
        t.data_inicio dataInicio,
        t.data_fim dataFim,
        t.status_turma statusTurma,
        t.tipo_instrutor tipoInstrutor,
        t.id_instrutor_funcionario idInstrutorFuncionario,
        t.nome_instrutor_externo nomeInstrutorExterno
      FROM sst_treinamentos_turmas t
      INNER JOIN sst_treinamentos_modelos m ON m.id_treinamento_modelo = t.id_treinamento_modelo
      WHERE t.tenant_id = ? AND t.id_treinamento_turma = ?
      `,
      [current.tenantId, id]
    );
    if (!headRows.length) return fail(404, 'Turma não encontrada');

    const [participantes]: any = await db.query(
      `
      SELECT
        p.id_treinamento_participante id,
        p.tipo_participante tipoParticipante,
        p.id_funcionario idFuncionario,
        p.id_terceirizado_trabalhador idTerceirizadoTrabalhador,
        COALESCE(f.nome_completo, tt.nome_completo) participanteNome,
        p.status_participacao statusParticipacao,
        p.presenca_percentual presencaPercentual,
        p.nota,
        p.id_assinatura_participante idAssinaturaParticipante,
        p.data_conclusao dataConclusao,
        p.validade_ate validadeAte,
        p.data_alerta_reciclagem dataAlertaReciclagem,
        p.codigo_certificado codigoCertificado
      FROM sst_treinamentos_participantes p
      LEFT JOIN funcionarios f ON f.id_funcionario = p.id_funcionario
      LEFT JOIN terceirizados_trabalhadores tt ON tt.id_terceirizado_trabalhador = p.id_terceirizado_trabalhador
      WHERE p.id_treinamento_turma = ?
      ORDER BY participanteNome
      `,
      [id]
    );

    return ok({ ...headRows[0], participantes });
  } catch (e) {
    return handleApiError(e);
  }
}
