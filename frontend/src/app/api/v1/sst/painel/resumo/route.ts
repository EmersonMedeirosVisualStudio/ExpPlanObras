import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { ok, handleApiError } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { buildLocalFilter } from '@/lib/api/local-filter';
import { PERMISSIONS } from '@/lib/auth/permissions';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  try {
    const current = await requireApiPermission(PERMISSIONS.SST_PAINEL_VIEW);
    const local = buildLocalFilter(req.nextUrl.searchParams);
    const localTurma = buildLocalFilter(req.nextUrl.searchParams, 't');
    const localEpi = buildLocalFilter(req.nextUrl.searchParams, 'f');
    const localProg = buildLocalFilter(req.nextUrl.searchParams, 'p');

    const [[ncAbertasRows]]: any = await db.query(
      `
      SELECT COUNT(*) AS total
      FROM sst_nao_conformidades
      WHERE tenant_id = ?
        AND status_nc IN ('ABERTA', 'EM_TRATAMENTO', 'AGUARDANDO_VALIDACAO')
        ${local.sql}
      `,
      [current.tenantId, ...local.params]
    );

    const [[ncVencidasRows]]: any = await db.query(
      `
      SELECT COUNT(*) AS total
      FROM sst_nao_conformidades
      WHERE tenant_id = ?
        AND status_nc IN ('ABERTA', 'EM_TRATAMENTO', 'AGUARDANDO_VALIDACAO')
        AND prazo_correcao IS NOT NULL
        AND prazo_correcao < CURDATE()
        ${local.sql}
      `,
      [current.tenantId, ...local.params]
    );

    const [[acidentesMesRows]]: any = await db.query(
      `
      SELECT COUNT(*) AS total
      FROM sst_acidentes
      WHERE tenant_id = ?
        AND tipo_ocorrencia IN ('ACIDENTE_SEM_AFASTAMENTO','ACIDENTE_COM_AFASTAMENTO','FATAL')
        AND DATE_FORMAT(data_hora_ocorrencia, '%Y-%m') = DATE_FORMAT(CURDATE(), '%Y-%m')
        ${local.sql}
      `,
      [current.tenantId, ...local.params]
    );

    const [[catPendentesRows]]: any = await db.query(
      `
      SELECT COUNT(*) AS total
      FROM sst_acidentes
      WHERE tenant_id = ?
        AND cat_aplicavel = 1
        AND cat_registrada = 0
        AND status_acidente IN ('ABERTO','EM_INVESTIGACAO','AGUARDANDO_VALIDACAO')
        ${local.sql}
      `,
      [current.tenantId, ...local.params]
    );

    const [[treinVencRows]]: any = await db.query(
      `
      SELECT COUNT(*) AS total
      FROM sst_treinamentos_participantes p
      INNER JOIN sst_treinamentos_turmas t ON t.id_treinamento_turma = p.id_treinamento_turma
      WHERE t.tenant_id = ?
        AND p.validade_ate IS NOT NULL
        AND p.validade_ate < CURDATE()
        ${localTurma.sql}
      `,
      [current.tenantId, ...localTurma.params]
    );

    const [[treinAlertaRows]]: any = await db.query(
      `
      SELECT COUNT(*) AS total
      FROM sst_treinamentos_participantes p
      INNER JOIN sst_treinamentos_turmas t ON t.id_treinamento_turma = p.id_treinamento_turma
      WHERE t.tenant_id = ?
        AND p.validade_ate IS NOT NULL
        AND p.validade_ate >= CURDATE()
        AND p.data_alerta_reciclagem IS NOT NULL
        AND p.data_alerta_reciclagem <= CURDATE()
        ${localTurma.sql}
      `,
      [current.tenantId, ...localTurma.params]
    );

    const [[epiTrocaRows]]: any = await db.query(
      `
      SELECT COUNT(*) AS total
      FROM sst_epi_fichas_itens i
      INNER JOIN sst_epi_fichas f ON f.id_ficha_epi = i.id_ficha_epi
      WHERE f.tenant_id = ?
        AND i.status_item = 'ENTREGUE'
        AND i.data_prevista_troca IS NOT NULL
        AND i.data_prevista_troca < CURDATE()
        ${localEpi.sql}
      `,
      [current.tenantId, ...localEpi.params]
    );

    const [[caVencidoRows]]: any = await db.query(
      `
      SELECT COUNT(*) AS total
      FROM sst_epi_fichas_itens i
      INNER JOIN sst_epi_fichas f ON f.id_ficha_epi = i.id_ficha_epi
      INNER JOIN sst_epi_catalogo c ON c.id_epi = i.id_epi
      WHERE f.tenant_id = ?
        AND i.status_item = 'ENTREGUE'
        AND c.ca_validade IS NOT NULL
        AND c.ca_validade < CURDATE()
        ${localEpi.sql}
      `,
      [current.tenantId, ...localEpi.params]
    );

    const [[checkPendRows]]: any = await db.query(
      `
      SELECT COUNT(*) AS total
      FROM sst_checklists_programacoes p
      INNER JOIN sst_checklists_modelos m ON m.id_modelo_checklist = p.id_modelo_checklist
      LEFT JOIN (
        SELECT
          e.id_modelo_checklist,
          e.tipo_local,
          COALESCE(e.id_obra, 0) AS id_obra_ref,
          COALESCE(e.id_unidade, 0) AS id_unidade_ref,
          MAX(CASE WHEN e.status_execucao = 'FINALIZADA' THEN e.data_referencia END) AS ultima_execucao
        FROM sst_checklists_execucoes e
        WHERE e.tenant_id = ?
        GROUP BY e.id_modelo_checklist, e.tipo_local, COALESCE(e.id_obra, 0), COALESCE(e.id_unidade, 0)
      ) u
        ON u.id_modelo_checklist = p.id_modelo_checklist
       AND u.tipo_local = p.tipo_local
       AND u.id_obra_ref = COALESCE(p.id_obra, 0)
       AND u.id_unidade_ref = COALESCE(p.id_unidade, 0)
      WHERE p.tenant_id = ?
        AND p.ativo = 1
        ${localProg.sql}
        AND (
          (COALESCE(p.periodicidade_override, m.periodicidade) = 'DIARIO'
            AND (u.ultima_execucao IS NULL OR u.ultima_execucao < CURDATE()))
          OR
          (COALESCE(p.periodicidade_override, m.periodicidade) = 'SEMANAL'
            AND (u.ultima_execucao IS NULL OR YEARWEEK(u.ultima_execucao, 1) < YEARWEEK(CURDATE(), 1)))
          OR
          (COALESCE(p.periodicidade_override, m.periodicidade) = 'MENSAL'
            AND (u.ultima_execucao IS NULL OR DATE_FORMAT(u.ultima_execucao, '%Y-%m') < DATE_FORMAT(CURDATE(), '%Y-%m')))
        )
      `,
      [current.tenantId, current.tenantId, ...localProg.params]
    );

    const [[checkAtrasRows]]: any = await db.query(
      `
      SELECT COUNT(*) AS total
      FROM sst_checklists_programacoes p
      INNER JOIN sst_checklists_modelos m ON m.id_modelo_checklist = p.id_modelo_checklist
      LEFT JOIN (
        SELECT
          e.id_modelo_checklist,
          e.tipo_local,
          COALESCE(e.id_obra, 0) AS id_obra_ref,
          COALESCE(e.id_unidade, 0) AS id_unidade_ref,
          MAX(CASE WHEN e.status_execucao = 'FINALIZADA' THEN e.data_referencia END) AS ultima_execucao
        FROM sst_checklists_execucoes e
        WHERE e.tenant_id = ?
        GROUP BY e.id_modelo_checklist, e.tipo_local, COALESCE(e.id_obra, 0), COALESCE(e.id_unidade, 0)
      ) u
        ON u.id_modelo_checklist = p.id_modelo_checklist
       AND u.tipo_local = p.tipo_local
       AND u.id_obra_ref = COALESCE(p.id_obra, 0)
       AND u.id_unidade_ref = COALESCE(p.id_unidade, 0)
      WHERE p.tenant_id = ?
        AND p.ativo = 1
        ${localProg.sql}
        AND (
          (COALESCE(p.periodicidade_override, m.periodicidade) = 'DIARIO'
            AND (u.ultima_execucao IS NULL OR u.ultima_execucao < CURDATE() - INTERVAL 1 DAY))
          OR
          (COALESCE(p.periodicidade_override, m.periodicidade) = 'SEMANAL'
            AND (u.ultima_execucao IS NULL OR YEARWEEK(u.ultima_execucao, 1) < YEARWEEK(CURDATE() - INTERVAL 1 WEEK, 1)))
          OR
          (COALESCE(p.periodicidade_override, m.periodicidade) = 'MENSAL'
            AND (u.ultima_execucao IS NULL OR DATE_FORMAT(u.ultima_execucao, '%Y-%m') < DATE_FORMAT(CURDATE() - INTERVAL 1 MONTH, '%Y-%m')))
        )
      `,
      [current.tenantId, current.tenantId, ...localProg.params]
    );

    const [[diasSemAcidenteRows]]: any = await db.query(
      `
      SELECT
        CASE
          WHEN MAX(data_hora_ocorrencia) IS NULL THEN NULL
          ELSE DATEDIFF(CURDATE(), DATE(MAX(data_hora_ocorrencia)))
        END AS total
      FROM sst_acidentes
      WHERE tenant_id = ?
        AND (tipo_ocorrencia IN ('ACIDENTE_COM_AFASTAMENTO', 'FATAL') OR houve_afastamento = 1)
        ${local.sql}
      `,
      [current.tenantId, ...local.params]
    );

    return ok({
      ncAbertas: Number(ncAbertasRows.total || 0),
      ncVencidas: Number(ncVencidasRows.total || 0),
      acidentesMes: Number(acidentesMesRows.total || 0),
      catPendentes: Number(catPendentesRows.total || 0),
      treinamentosVencidos: Number(treinVencRows.total || 0),
      treinamentosAlerta: Number(treinAlertaRows.total || 0),
      epiTrocaPendente: Number(epiTrocaRows.total || 0),
      epiCaVencido: Number(caVencidoRows.total || 0),
      checklistsPendentes: Number(checkPendRows.total || 0),
      checklistsAtrasados: Number(checkAtrasRows.total || 0),
      diasSemAcidenteComAfastamento: diasSemAcidenteRows.total != null ? Number(diasSemAcidenteRows.total) : null,
    });
  } catch (e) {
    return handleApiError(e);
  }
}

