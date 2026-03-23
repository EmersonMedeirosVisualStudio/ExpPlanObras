import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { ok, handleApiError } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { PERMISSIONS } from '@/lib/auth/permissions';

export const runtime = 'nodejs';

function toCount(x: any): number {
  return Number(x?.[0]?.[0]?.total || 0);
}

export async function GET(_req: NextRequest) {
  try {
    const current = await requireApiPermission(PERMISSIONS.SST_PAINEL_VIEW);

    const [
      ncsAbertasRows,
      ncsVencidasRows,
      acidentesMesRows,
      catsPendentesRows,
      treinamentosVencidosRows,
      treinamentosAlertaRows,
      epiTrocaVencidaRows,
      epiCaVencidoEmUsoRows,
      checklistsPendentesRows,
      checklistsAtrasadosRows,
      diasSemAcidenteAfastamentoRows,
    ]: any[] = await Promise.all([
      db.query(
        `
        SELECT COUNT(*) total
        FROM sst_nao_conformidades
        WHERE tenant_id = ?
          AND status_nc NOT IN ('CONCLUIDA', 'CANCELADA')
        `,
        [current.tenantId]
      ),
      db.query(
        `
        SELECT COUNT(*) total
        FROM sst_nao_conformidades
        WHERE tenant_id = ?
          AND status_nc NOT IN ('CONCLUIDA', 'CANCELADA')
          AND prazo_correcao IS NOT NULL
          AND prazo_correcao < CURDATE()
        `,
        [current.tenantId]
      ),
      db.query(
        `
        SELECT COUNT(*) total
        FROM sst_acidentes
        WHERE tenant_id = ?
          AND data_hora_ocorrencia >= DATE_FORMAT(CURDATE(), '%Y-%m-01')
          AND data_hora_ocorrencia < DATE_ADD(DATE_FORMAT(CURDATE(), '%Y-%m-01'), INTERVAL 1 MONTH)
          AND status_acidente <> 'CANCELADO'
        `,
        [current.tenantId]
      ),
      db.query(
        `
        SELECT COUNT(*) total
        FROM sst_acidentes
        WHERE tenant_id = ?
          AND status_acidente <> 'CANCELADO'
          AND cat_aplicavel = 1
          AND cat_registrada = 0
        `,
        [current.tenantId]
      ),
      db.query(
        `
        SELECT COUNT(*) total
        FROM sst_treinamentos_participantes p
        INNER JOIN sst_treinamentos_turmas t ON t.id_treinamento_turma = p.id_treinamento_turma
        WHERE t.tenant_id = ?
          AND p.validade_ate IS NOT NULL
          AND p.validade_ate < CURDATE()
        `,
        [current.tenantId]
      ),
      db.query(
        `
        SELECT COUNT(*) total
        FROM sst_treinamentos_participantes p
        INNER JOIN sst_treinamentos_turmas t ON t.id_treinamento_turma = p.id_treinamento_turma
        WHERE t.tenant_id = ?
          AND p.data_alerta_reciclagem IS NOT NULL
          AND p.data_alerta_reciclagem <= CURDATE()
          AND (p.validade_ate IS NULL OR p.validade_ate >= CURDATE())
        `,
        [current.tenantId]
      ),
      db.query(
        `
        SELECT COUNT(*) total
        FROM sst_epi_fichas_itens i
        INNER JOIN sst_epi_fichas f ON f.id_ficha_epi = i.id_ficha_epi
        WHERE f.tenant_id = ?
          AND i.status_item = 'ENTREGUE'
          AND i.data_prevista_troca IS NOT NULL
          AND i.data_prevista_troca < CURDATE()
        `,
        [current.tenantId]
      ),
      db.query(
        `
        SELECT COUNT(*) total
        FROM sst_epi_fichas_itens i
        INNER JOIN sst_epi_fichas f ON f.id_ficha_epi = i.id_ficha_epi
        INNER JOIN sst_epi_catalogo e ON e.id_epi = i.id_epi
        WHERE f.tenant_id = ?
          AND i.status_item = 'ENTREGUE'
          AND e.ca_validade IS NOT NULL
          AND e.ca_validade < CURDATE()
        `,
        [current.tenantId]
      ),
      db.query(
        `
        SELECT COUNT(*) total
        FROM sst_checklists_programacoes p
        INNER JOIN sst_checklists_modelos m ON m.id_modelo_checklist = p.id_modelo_checklist
        LEFT JOIN (
          SELECT
            e.tenant_id,
            e.id_modelo_checklist,
            e.tipo_local,
            e.id_obra,
            e.id_unidade,
            MAX(e.data_referencia) AS ultima_data
          FROM sst_checklists_execucoes e
          GROUP BY e.tenant_id, e.id_modelo_checklist, e.tipo_local, e.id_obra, e.id_unidade
        ) u
          ON u.tenant_id = p.tenant_id
         AND u.id_modelo_checklist = p.id_modelo_checklist
         AND u.tipo_local = p.tipo_local
         AND COALESCE(u.id_obra, 0) = COALESCE(p.id_obra, 0)
         AND COALESCE(u.id_unidade, 0) = COALESCE(p.id_unidade, 0)
        WHERE p.tenant_id = ?
          AND p.ativo = 1
          AND p.data_inicio_vigencia <= CURDATE()
          AND (p.data_fim_vigencia IS NULL OR p.data_fim_vigencia >= CURDATE())
          AND (
            u.ultima_data IS NULL
            OR (
              COALESCE(p.periodicidade_override, m.periodicidade) = 'DIARIO' AND u.ultima_data < CURDATE()
            )
            OR (
              COALESCE(p.periodicidade_override, m.periodicidade) = 'SEMANAL' AND u.ultima_data < DATE_SUB(CURDATE(), INTERVAL 7 DAY)
            )
            OR (
              COALESCE(p.periodicidade_override, m.periodicidade) = 'MENSAL' AND u.ultima_data < DATE_SUB(CURDATE(), INTERVAL 30 DAY)
            )
            OR (
              COALESCE(p.periodicidade_override, m.periodicidade) = 'PONTUAL' AND u.ultima_data IS NULL
            )
          )
        `,
        [current.tenantId]
      ),
      db.query(
        `
        SELECT COUNT(*) total
        FROM sst_checklists_programacoes p
        LEFT JOIN (
          SELECT
            e.tenant_id,
            e.id_modelo_checklist,
            e.tipo_local,
            e.id_obra,
            e.id_unidade,
            MAX(e.data_referencia) AS ultima_data
          FROM sst_checklists_execucoes e
          GROUP BY e.tenant_id, e.id_modelo_checklist, e.tipo_local, e.id_obra, e.id_unidade
        ) u
          ON u.tenant_id = p.tenant_id
         AND u.id_modelo_checklist = p.id_modelo_checklist
         AND u.tipo_local = p.tipo_local
         AND COALESCE(u.id_obra, 0) = COALESCE(p.id_obra, 0)
         AND COALESCE(u.id_unidade, 0) = COALESCE(p.id_unidade, 0)
        INNER JOIN sst_checklists_modelos m ON m.id_modelo_checklist = p.id_modelo_checklist
        WHERE p.tenant_id = ?
          AND p.ativo = 1
          AND p.data_inicio_vigencia <= CURDATE()
          AND (p.data_fim_vigencia IS NULL OR p.data_fim_vigencia >= CURDATE())
          AND (
            (COALESCE(p.periodicidade_override, m.periodicidade) = 'DIARIO' AND COALESCE(u.ultima_data, '1900-01-01') < DATE_SUB(CURDATE(), INTERVAL 1 DAY))
            OR (COALESCE(p.periodicidade_override, m.periodicidade) = 'SEMANAL' AND COALESCE(u.ultima_data, '1900-01-01') < DATE_SUB(CURDATE(), INTERVAL 14 DAY))
            OR (COALESCE(p.periodicidade_override, m.periodicidade) = 'MENSAL' AND COALESCE(u.ultima_data, '1900-01-01') < DATE_SUB(CURDATE(), INTERVAL 60 DAY))
            OR (COALESCE(p.periodicidade_override, m.periodicidade) = 'PONTUAL' AND u.ultima_data IS NULL AND p.data_inicio_vigencia < CURDATE())
          )
        `,
        [current.tenantId]
      ),
      db.query(
        `
        SELECT
          COALESCE(DATEDIFF(CURDATE(), DATE(MAX(data_hora_ocorrencia))), NULL) AS dias
        FROM sst_acidentes
        WHERE tenant_id = ?
          AND status_acidente <> 'CANCELADO'
          AND houve_afastamento = 1
        `,
        [current.tenantId]
      ),
    ]);

    const [ncsCriticas]: any = (await db.query(
      `
      SELECT
        id_nc id,
        tipo_local tipoLocal,
        id_obra idObra,
        id_unidade idUnidade,
        titulo,
        status_nc statusNc,
        prazo_correcao prazoCorrecao
      FROM sst_nao_conformidades
      WHERE tenant_id = ?
        AND severidade = 'CRITICA'
        AND status_nc NOT IN ('CONCLUIDA', 'CANCELADA')
      ORDER BY COALESCE(prazo_correcao, '2999-12-31') ASC, id_nc DESC
      LIMIT 10
      `,
      [current.tenantId]
    )) as any;

    const [catsPendentes]: any = (await db.query(
      `
      SELECT
        id_acidente id,
        tipo_local tipoLocal,
        id_obra idObra,
        id_unidade idUnidade,
        tipo_ocorrencia tipoOcorrencia,
        severidade,
        data_hora_ocorrencia dataHoraOcorrencia,
        status_acidente statusAcidente
      FROM sst_acidentes
      WHERE tenant_id = ?
        AND status_acidente <> 'CANCELADO'
        AND cat_aplicavel = 1
        AND cat_registrada = 0
      ORDER BY data_hora_ocorrencia DESC
      LIMIT 10
      `,
      [current.tenantId]
    )) as any;

    const [treinamentosVencidos]: any = (await db.query(
      `
      SELECT
        p.id_treinamento_participante id,
        p.tipo_participante tipoParticipante,
        p.id_funcionario idFuncionario,
        p.id_terceirizado_trabalhador idTerceirizadoTrabalhador,
        COALESCE(f.nome_completo, tt.nome_completo, 'Participante') participanteNome,
        p.validade_ate validadeAte
      FROM sst_treinamentos_participantes p
      INNER JOIN sst_treinamentos_turmas t ON t.id_treinamento_turma = p.id_treinamento_turma
      LEFT JOIN funcionarios f ON f.id_funcionario = p.id_funcionario AND f.tenant_id = t.tenant_id
      LEFT JOIN terceirizados_trabalhadores tt ON tt.id_terceirizado_trabalhador = p.id_terceirizado_trabalhador AND tt.tenant_id = t.tenant_id
      WHERE t.tenant_id = ?
        AND p.validade_ate IS NOT NULL
        AND p.validade_ate < CURDATE()
      ORDER BY p.validade_ate ASC
      LIMIT 10
      `,
      [current.tenantId]
    )) as any;

    const [episVencidos]: any = (await db.query(
      `
      SELECT
        i.id_ficha_epi_item id,
        f.tipo_local tipoLocal,
        f.id_obra idObra,
        f.id_unidade idUnidade,
        e.nome_epi nomeEpi,
        i.data_prevista_troca dataPrevistaTroca,
        e.ca_validade caValidade
      FROM sst_epi_fichas_itens i
      INNER JOIN sst_epi_fichas f ON f.id_ficha_epi = i.id_ficha_epi
      INNER JOIN sst_epi_catalogo e ON e.id_epi = i.id_epi
      WHERE f.tenant_id = ?
        AND i.status_item = 'ENTREGUE'
        AND (
          (i.data_prevista_troca IS NOT NULL AND i.data_prevista_troca < CURDATE())
          OR
          (e.ca_validade IS NOT NULL AND e.ca_validade < CURDATE())
        )
      ORDER BY COALESCE(i.data_prevista_troca, '2999-12-31') ASC, COALESCE(e.ca_validade, '2999-12-31') ASC
      LIMIT 10
      `,
      [current.tenantId]
    )) as any;

    const [checklistsAtrasados]: any = (await db.query(
      `
      SELECT
        p.id_programacao_checklist id,
        p.tipo_local tipoLocal,
        p.id_obra idObra,
        p.id_unidade idUnidade,
        m.nome_modelo nomeModelo,
        COALESCE(p.periodicidade_override, m.periodicidade) periodicidade,
        u.ultima_data ultimaExecucao
      FROM sst_checklists_programacoes p
      INNER JOIN sst_checklists_modelos m ON m.id_modelo_checklist = p.id_modelo_checklist
      LEFT JOIN (
        SELECT
          e.tenant_id,
          e.id_modelo_checklist,
          e.tipo_local,
          e.id_obra,
          e.id_unidade,
          MAX(e.data_referencia) AS ultima_data
        FROM sst_checklists_execucoes e
        GROUP BY e.tenant_id, e.id_modelo_checklist, e.tipo_local, e.id_obra, e.id_unidade
      ) u
        ON u.tenant_id = p.tenant_id
       AND u.id_modelo_checklist = p.id_modelo_checklist
       AND u.tipo_local = p.tipo_local
       AND COALESCE(u.id_obra, 0) = COALESCE(p.id_obra, 0)
       AND COALESCE(u.id_unidade, 0) = COALESCE(p.id_unidade, 0)
      WHERE p.tenant_id = ?
        AND p.ativo = 1
        AND p.data_inicio_vigencia <= CURDATE()
        AND (p.data_fim_vigencia IS NULL OR p.data_fim_vigencia >= CURDATE())
        AND (
          (COALESCE(p.periodicidade_override, m.periodicidade) = 'DIARIO' AND COALESCE(u.ultima_data, '1900-01-01') < DATE_SUB(CURDATE(), INTERVAL 1 DAY))
          OR (COALESCE(p.periodicidade_override, m.periodicidade) = 'SEMANAL' AND COALESCE(u.ultima_data, '1900-01-01') < DATE_SUB(CURDATE(), INTERVAL 14 DAY))
          OR (COALESCE(p.periodicidade_override, m.periodicidade) = 'MENSAL' AND COALESCE(u.ultima_data, '1900-01-01') < DATE_SUB(CURDATE(), INTERVAL 60 DAY))
          OR (COALESCE(p.periodicidade_override, m.periodicidade) = 'PONTUAL' AND u.ultima_data IS NULL AND p.data_inicio_vigencia < CURDATE())
        )
      ORDER BY p.tipo_local, COALESCE(p.id_obra, 0), COALESCE(p.id_unidade, 0), m.nome_modelo
      LIMIT 10
      `,
      [current.tenantId]
    )) as any;

    const [acidentesPorMes]: any = (await db.query(
      `
      SELECT
        DATE_FORMAT(data_hora_ocorrencia, '%Y-%m') mes,
        COUNT(*) total
      FROM sst_acidentes
      WHERE tenant_id = ?
        AND status_acidente <> 'CANCELADO'
        AND data_hora_ocorrencia >= DATE_SUB(DATE_FORMAT(CURDATE(), '%Y-%m-01'), INTERVAL 5 MONTH)
      GROUP BY DATE_FORMAT(data_hora_ocorrencia, '%Y-%m')
      ORDER BY mes
      `,
      [current.tenantId]
    )) as any;

    const [ncsPorMes]: any = (await db.query(
      `
      SELECT
        DATE_FORMAT(data_identificacao, '%Y-%m') mes,
        COUNT(*) total
      FROM sst_nao_conformidades
      WHERE tenant_id = ?
        AND data_identificacao >= DATE_SUB(DATE_FORMAT(CURDATE(), '%Y-%m-01'), INTERVAL 5 MONTH)
      GROUP BY DATE_FORMAT(data_identificacao, '%Y-%m')
      ORDER BY mes
      `,
      [current.tenantId]
    )) as any;

    const [treinamentosVencidosPorMes]: any = (await db.query(
      `
      SELECT
        DATE_FORMAT(p.validade_ate, '%Y-%m') mes,
        COUNT(*) total
      FROM sst_treinamentos_participantes p
      INNER JOIN sst_treinamentos_turmas t ON t.id_treinamento_turma = p.id_treinamento_turma
      WHERE t.tenant_id = ?
        AND p.validade_ate IS NOT NULL
        AND p.validade_ate >= DATE_SUB(DATE_FORMAT(CURDATE(), '%Y-%m-01'), INTERVAL 5 MONTH)
      GROUP BY DATE_FORMAT(p.validade_ate, '%Y-%m')
      ORDER BY mes
      `,
      [current.tenantId]
    )) as any;

    const cards = {
      ncsAbertas: toCount(ncsAbertasRows),
      ncsVencidas: toCount(ncsVencidasRows),
      acidentesMes: toCount(acidentesMesRows),
      catsPendentes: toCount(catsPendentesRows),
      treinamentosVencidos: toCount(treinamentosVencidosRows),
      treinamentosAlerta: toCount(treinamentosAlertaRows),
      epiTrocaVencida: toCount(epiTrocaVencidaRows),
      epiCaVencidoEmUso: toCount(epiCaVencidoEmUsoRows),
      checklistsPendentes: toCount(checklistsPendentesRows),
      checklistsAtrasados: toCount(checklistsAtrasadosRows),
      diasSemAcidenteComAfastamento: diasSemAcidenteAfastamentoRows?.[0]?.[0]?.dias === null ? null : Number(diasSemAcidenteAfastamentoRows?.[0]?.[0]?.dias || 0),
    };

    return ok({
      cards,
      listas: { ncsCriticas, catsPendentes, treinamentosVencidos, episVencidos, checklistsAtrasados },
      series: { acidentesPorMes, ncsPorMes, treinamentosVencidosPorMes },
    });
  } catch (e) {
    return handleApiError(e);
  }
}
