import type { DashboardExportContexto, DashboardExportDataDTO, DashboardExportFiltrosDTO } from './types';
import type { DashboardExportProvider } from './types-provider';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { db } from '@/lib/db';
import { getDashboardScope, inClause } from '@/lib/dashboard/scope';

function buildMixedFilter(obras: number[] | null, unidades: number[] | null, obraAlias: string, unidadeAlias: string) {
  if (obras === null && unidades === null) return { sql: '', params: [] as number[] };

  const parts: string[] = [];
  const params: number[] = [];

  if (obras && obras.length) {
    const c = inClause(obras);
    parts.push(`${obraAlias} IN ${c.sql}`);
    params.push(...c.params);
  }
  if (unidades && unidades.length) {
    const c = inClause(unidades);
    parts.push(`${unidadeAlias} IN ${c.sql}`);
    params.push(...c.params);
  }

  if (!parts.length) return { sql: ' AND 1 = 0', params: [] as number[] };
  return { sql: ` AND (${parts.join(' OR ')})`, params };
}

function buildOnlyFilter(ids: number[] | null, alias: string) {
  if (ids === null) return { sql: '', params: [] as number[] };
  if (!ids.length) return { sql: ' AND 1 = 0', params: [] as number[] };
  const c = inClause(ids);
  return { sql: ` AND ${alias} IN ${c.sql}`, params: c.params };
}

async function safeTotal(sql: string, params: any[]) {
  try {
    const [[row]]: any = await db.query(sql, params);
    return Number(row?.total || 0);
  } catch {
    return 0;
  }
}

async function safeRows(sql: string, params: any[]) {
  try {
    const [rows]: any = await db.query(sql, params);
    return rows as any[];
  } catch {
    return [];
  }
}

function mapFiltrosBase(f?: DashboardExportFiltrosDTO) {
  return {
    ...(f?.idObra ? { Obra: String(f.idObra) } : {}),
    ...(f?.idUnidade ? { Unidade: String(f.idUnidade) } : {}),
    ...(f?.idAlmoxarifado ? { Almoxarifado: String(f.idAlmoxarifado) } : {}),
  };
}

async function resolveScope(tenantId: number, userId: number, filtros?: DashboardExportFiltrosDTO) {
  const scope = await getDashboardScope({ tenantId, id: userId });
  const idObra = Number(filtros?.idObra || 0);
  const idUnidade = Number(filtros?.idUnidade || 0);
  if (!scope.empresaTotal) {
    if (idObra && !scope.obras.includes(idObra)) throw new Error('Obra fora da abrangência');
    if (idUnidade && !scope.unidades.includes(idUnidade)) throw new Error('Unidade fora da abrangência');
  }
  const obrasSelecionadas = idObra ? [idObra] : scope.empresaTotal && !idUnidade ? null : scope.obras;
  const unidadesSelecionadas = idUnidade ? [idUnidade] : scope.empresaTotal && !idObra ? null : scope.unidades;
  return { scope, obrasSelecionadas, unidadesSelecionadas };
}

export const engenhariaExportProvider: DashboardExportProvider = {
  contexto: 'ENGENHARIA',
  requiredPermission: PERMISSIONS.DASHBOARD_ENGENHARIA_VIEW,
  async build({ tenantId, userId, filtros }) {
    const { obrasSelecionadas, unidadesSelecionadas } = await resolveScope(tenantId, userId, filtros);
    const fObra = buildOnlyFilter(obrasSelecionadas, 'o.id_obra');
    const fSolic = buildMixedFilter(obrasSelecionadas, unidadesSelecionadas, 's.id_obra_origem', 's.id_unidade_origem');
    const fNc = buildMixedFilter(obrasSelecionadas, unidadesSelecionadas, 'nc.id_obra', 'nc.id_unidade');
    const fAc = buildMixedFilter(obrasSelecionadas, unidadesSelecionadas, 'a.id_obra', 'a.id_unidade');
    const fProg = buildMixedFilter(obrasSelecionadas, unidadesSelecionadas, 'p.id_obra', 'p.id_unidade');

    const obrasAtivas = await safeTotal(
      `
      SELECT COUNT(*) AS total
      FROM obras o
      INNER JOIN contratos c ON c.id_contrato = o.id_contrato
      WHERE c.tenant_id = ?
        AND o.status_obra = 'ATIVA'
        ${fObra.sql}
      `,
      [tenantId, ...fObra.params]
    );

    const obrasParalisadas = await safeTotal(
      `
      SELECT COUNT(*) AS total
      FROM obras o
      INNER JOIN contratos c ON c.id_contrato = o.id_contrato
      WHERE c.tenant_id = ?
        AND o.status_obra = 'PARALISADA'
        ${fObra.sql}
      `,
      [tenantId, ...fObra.params]
    );

    const obrasConcluidasMes = await safeTotal(
      `
      SELECT COUNT(*) AS total
      FROM obras o
      INNER JOIN contratos c ON c.id_contrato = o.id_contrato
      WHERE c.tenant_id = ?
        AND o.status_obra = 'CONCLUIDA'
        AND DATE_FORMAT(o.data_conclusao, '%Y-%m') = DATE_FORMAT(CURDATE(), '%Y-%m')
        ${fObra.sql}
      `,
      [tenantId, ...fObra.params]
    );

    const medicoesPendentes = await safeTotal(
      `
      SELECT COUNT(DISTINCT m.id_medicao) AS total
      FROM contratos_medicoes m
      INNER JOIN contratos c ON c.id_contrato = m.id_contrato
      INNER JOIN obras o ON o.id_contrato = c.id_contrato
      WHERE c.tenant_id = ?
        AND m.status_medicao IN ('EM_ELABORACAO', 'ENVIADA')
        ${fObra.sql}
      `,
      [tenantId, ...fObra.params]
    );

    const alertas = await safeRows(
      `
      SELECT tipo, titulo, subtitulo, criticidade
      FROM (
        SELECT
          'CONTRATO_VENCENDO' AS tipo,
          CONCAT('Contrato vencendo: ', numero_contrato) AS titulo,
          CONCAT('Fim previsto em ', DATE_FORMAT(data_fim_previsto, '%d/%m/%Y')) AS subtitulo,
          'ALTA' AS criticidade,
          1 AS ord
        FROM contratos
        WHERE tenant_id = ?
          AND data_fim_previsto IS NOT NULL
          AND data_fim_previsto BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 30 DAY)
        UNION ALL
        SELECT
          'MEDICAO_ATRASADA' AS tipo,
          CONCAT('Medição atrasada do contrato ', c.numero_contrato) AS titulo,
          CONCAT('Prevista ', DATE_FORMAT(m.data_prevista_envio, '%d/%m/%Y'), ' / status ', m.status_medicao) AS subtitulo,
          'ALTA' AS criticidade,
          2 AS ord
        FROM contratos_medicoes m
        INNER JOIN contratos c ON c.id_contrato = m.id_contrato
        INNER JOIN obras o ON o.id_contrato = c.id_contrato
        WHERE c.tenant_id = ?
          AND m.status_medicao IN ('EM_ELABORACAO', 'ENVIADA')
          AND m.data_prevista_envio IS NOT NULL
          AND m.data_prevista_envio < CURDATE()
          ${fObra.sql}
        UNION ALL
        SELECT
          'SOLICITACAO_URGENTE' AS tipo,
          CONCAT('Solicitação urgente #', s.id_solicitacao_material) AS titulo,
          CONCAT('Status ', s.status_solicitacao, ' / ', s.regime_urgencia) AS subtitulo,
          CASE WHEN s.regime_urgencia = 'EMERGENCIAL' THEN 'CRITICA' ELSE 'ALTA' END AS criticidade,
          3 AS ord
        FROM solicitacao_material s
        WHERE s.tenant_id = ?
          AND s.regime_urgencia IN ('URGENTE', 'EMERGENCIAL')
          AND s.status_solicitacao NOT IN ('RECEBIDA', 'CANCELADA')
          ${fSolic.sql}
        UNION ALL
        SELECT
          'NC_CRITICA' AS tipo,
          CONCAT('NC crítica #', nc.id_nc) AS titulo,
          CONCAT('Status ', nc.status_nc) AS subtitulo,
          'CRITICA' AS criticidade,
          4 AS ord
        FROM sst_nao_conformidades nc
        WHERE nc.tenant_id = ?
          AND nc.status_nc IN ('ABERTA','EM_TRATAMENTO','AGUARDANDO_VALIDACAO')
          AND nc.severidade IN ('ALTA','CRITICA')
          ${fNc.sql}
        UNION ALL
        SELECT
          'CHECKLIST_ATRASADO' AS tipo,
          CONCAT('Checklist atrasado: ', m.nome_modelo) AS titulo,
          CONCAT('Periodicidade ', COALESCE(p.periodicidade_override, m.periodicidade)) AS subtitulo,
          'MEDIA' AS criticidade,
          5 AS ord
        FROM sst_checklists_programacoes p
        INNER JOIN sst_checklists_modelos m ON m.id_modelo_checklist = p.id_modelo_checklist
        LEFT JOIN (
          SELECT
            e.tenant_id,
            e.id_modelo_checklist,
            e.tipo_local,
            e.id_obra,
            e.id_unidade,
            MAX(CASE WHEN e.status_execucao = 'FINALIZADA' THEN e.data_referencia END) AS ultima_execucao
          FROM sst_checklists_execucoes e
          WHERE e.tenant_id = ?
          GROUP BY e.tenant_id, e.id_modelo_checklist, e.tipo_local, e.id_obra, e.id_unidade
        ) u
          ON u.tenant_id = p.tenant_id
         AND u.id_modelo_checklist = p.id_modelo_checklist
         AND u.tipo_local = p.tipo_local
         AND COALESCE(u.id_obra, 0) = COALESCE(p.id_obra, 0)
         AND COALESCE(u.id_unidade, 0) = COALESCE(p.id_unidade, 0)
        WHERE p.tenant_id = ?
          AND p.ativo = 1
          ${fProg.sql}
          AND (
            (COALESCE(p.periodicidade_override, m.periodicidade) = 'DIARIO' AND COALESCE(u.ultima_execucao, '1900-01-01') < CURDATE())
            OR (COALESCE(p.periodicidade_override, m.periodicidade) = 'SEMANAL' AND COALESCE(u.ultima_execucao, '1900-01-01') < DATE_SUB(CURDATE(), INTERVAL 14 DAY))
            OR (COALESCE(p.periodicidade_override, m.periodicidade) = 'MENSAL' AND COALESCE(u.ultima_execucao, '1900-01-01') < DATE_SUB(CURDATE(), INTERVAL 60 DAY))
          )
      ) x
      ORDER BY x.ord
      LIMIT 20
      `,
      [tenantId, tenantId, ...fObra.params, tenantId, ...fSolic.params, tenantId, ...fNc.params, tenantId, tenantId, ...fProg.params]
    );

    const obrasRisco = await safeRows(
      `
      SELECT
        CONCAT('Obra #', o.id_obra) AS nomeObra,
        COALESCE(o.status_obra, '-') AS statusObra,
        COALESCE(med.total, 0) AS medicoesPendentes,
        COALESCE(sol.total, 0) AS solicitacoesUrgentes,
        COALESCE(nc.total, 0) AS ncsCriticas,
        COALESCE(ac.total, 0) AS acidentes90d,
        COALESCE(ch.total, 0) AS checklistsAtrasados,
        (COALESCE(med.total, 0) * 2
         + COALESCE(sol.total, 0) * 2
         + COALESCE(nc.total, 0) * 4
         + COALESCE(ac.total, 0) * 5
         + COALESCE(ch.total, 0) * 2) AS scoreRisco
      FROM obras o
      INNER JOIN contratos c ON c.id_contrato = o.id_contrato
      LEFT JOIN (
        SELECT o2.id_obra, COUNT(DISTINCT m.id_medicao) AS total
        FROM contratos_medicoes m
        INNER JOIN contratos c2 ON c2.id_contrato = m.id_contrato
        INNER JOIN obras o2 ON o2.id_contrato = c2.id_contrato
        WHERE c2.tenant_id = ?
          AND m.status_medicao IN ('EM_ELABORACAO', 'ENVIADA')
        GROUP BY o2.id_obra
      ) med ON med.id_obra = o.id_obra
      LEFT JOIN (
        SELECT s.id_obra_origem AS id_obra, COUNT(*) AS total
        FROM solicitacao_material s
        WHERE s.tenant_id = ?
          AND s.id_obra_origem IS NOT NULL
          AND s.regime_urgencia IN ('URGENTE', 'EMERGENCIAL')
          AND s.status_solicitacao NOT IN ('RECEBIDA', 'CANCELADA')
        GROUP BY s.id_obra_origem
      ) sol ON sol.id_obra = o.id_obra
      LEFT JOIN (
        SELECT nc.id_obra, COUNT(*) AS total
        FROM sst_nao_conformidades nc
        WHERE nc.tenant_id = ?
          AND nc.status_nc IN ('ABERTA','EM_TRATAMENTO','AGUARDANDO_VALIDACAO')
          AND nc.severidade IN ('ALTA','CRITICA')
        GROUP BY nc.id_obra
      ) nc ON nc.id_obra = o.id_obra
      LEFT JOIN (
        SELECT a.id_obra, COUNT(*) AS total
        FROM sst_acidentes a
        WHERE a.tenant_id = ?
          AND a.data_hora_ocorrencia >= DATE_SUB(CURDATE(), INTERVAL 90 DAY)
        GROUP BY a.id_obra
      ) ac ON ac.id_obra = o.id_obra
      LEFT JOIN (
        SELECT COALESCE(p.id_obra, 0) AS id_obra, COUNT(*) AS total
        FROM sst_checklists_programacoes p
        INNER JOIN sst_checklists_modelos m ON m.id_modelo_checklist = p.id_modelo_checklist
        LEFT JOIN (
          SELECT
            e.tenant_id,
            e.id_modelo_checklist,
            e.tipo_local,
            COALESCE(e.id_obra, 0) AS id_obra_ref,
            COALESCE(e.id_unidade, 0) AS id_unidade_ref,
            MAX(CASE WHEN e.status_execucao = 'FINALIZADA' THEN e.data_referencia END) AS ultima_execucao
          FROM sst_checklists_execucoes e
          WHERE e.tenant_id = ?
          GROUP BY e.tenant_id, e.id_modelo_checklist, e.tipo_local, COALESCE(e.id_obra, 0), COALESCE(e.id_unidade, 0)
        ) u
          ON u.tenant_id = p.tenant_id
         AND u.id_modelo_checklist = p.id_modelo_checklist
         AND u.tipo_local = p.tipo_local
         AND u.id_obra_ref = COALESCE(p.id_obra, 0)
         AND u.id_unidade_ref = COALESCE(p.id_unidade, 0)
        WHERE p.tenant_id = ?
          AND (
            (COALESCE(p.periodicidade_override, m.periodicidade) = 'DIARIO' AND COALESCE(u.ultima_execucao, '1900-01-01') < CURDATE())
            OR (COALESCE(p.periodicidade_override, m.periodicidade) = 'SEMANAL' AND COALESCE(u.ultima_execucao, '1900-01-01') < DATE_SUB(CURDATE(), INTERVAL 14 DAY))
            OR (COALESCE(p.periodicidade_override, m.periodicidade) = 'MENSAL' AND COALESCE(u.ultima_execucao, '1900-01-01') < DATE_SUB(CURDATE(), INTERVAL 60 DAY))
          )
        GROUP BY COALESCE(p.id_obra, 0)
      ) ch ON ch.id_obra = o.id_obra
      WHERE c.tenant_id = ?
        ${fObra.sql}
      ORDER BY scoreRisco DESC, o.id_obra DESC
      LIMIT 20
      `,
      [tenantId, tenantId, tenantId, tenantId, tenantId, tenantId, tenantId, ...fObra.params]
    );

    const medicoes = await safeRows(
      `
      SELECT
        m.id_medicao AS idMedicao,
        c.numero_contrato AS contratoNumero,
        CONCAT('Obra #', o.id_obra) AS obraNome,
        m.competencia AS competencia,
        m.status_medicao AS status,
        m.data_prevista_envio AS dataPrevistaEnvio,
        m.data_prevista_aprovacao AS dataPrevistaAprovacao,
        COALESCE(m.valor_medido, 0) AS valorMedido,
        CASE
          WHEN m.data_prevista_envio IS NULL THEN 0
          WHEN m.data_prevista_envio >= CURDATE() THEN 0
          ELSE DATEDIFF(CURDATE(), m.data_prevista_envio)
        END AS atrasoDias
      FROM contratos_medicoes m
      INNER JOIN contratos c ON c.id_contrato = m.id_contrato
      INNER JOIN obras o ON o.id_contrato = c.id_contrato
      WHERE c.tenant_id = ?
        AND m.status_medicao IN ('EM_ELABORACAO', 'ENVIADA')
        ${fObra.sql}
      ORDER BY atrasoDias DESC, m.id_medicao DESC
      LIMIT 30
      `,
      [tenantId, ...fObra.params]
    );

    const data: DashboardExportDataDTO = {
      titulo: 'Relatório Dashboard Engenharia',
      subtitulo: 'Indicadores de obras e medições',
      filtrosAplicados: mapFiltrosBase(filtros),
      cards: [
        { label: 'Obras ativas', valor: obrasAtivas },
        { label: 'Obras paralisadas', valor: obrasParalisadas },
        { label: 'Concluídas no mês', valor: obrasConcluidasMes },
        { label: 'Medições pendentes', valor: medicoesPendentes },
      ],
      alertas: (alertas || []).map((a: any) => ({ tipo: a.tipo, titulo: a.titulo, subtitulo: a.subtitulo, criticidade: a.criticidade })),
      tabelas: [
        {
          titulo: 'Obras em risco',
          colunas: ['Obra', 'Status', 'Medições', 'Urgências', 'NCs', 'Acidentes', 'Checklists', 'Score'],
          linhas: (obrasRisco || []).map((o: any) => [
            o.nomeObra,
            o.statusObra,
            o.medicoesPendentes,
            o.solicitacoesUrgentes,
            o.ncsCriticas,
            o.acidentes90d,
            o.checklistsAtrasados,
            o.scoreRisco,
          ]),
        },
        {
          titulo: 'Medições pendentes',
          colunas: ['ID', 'Contrato', 'Obra', 'Status', 'Prevista', 'Atraso (dias)', 'Valor'],
          linhas: (medicoes || []).map((m: any) => [
            m.idMedicao,
            m.contratoNumero,
            m.obraNome,
            m.status,
            m.dataPrevistaEnvio,
            m.atrasoDias,
            m.valorMedido,
          ]),
        },
      ],
    };
    return data;
  },
};

export const rhExportProvider: DashboardExportProvider = {
  contexto: 'RH',
  requiredPermission: PERMISSIONS.DASHBOARD_RH_VIEW,
  async build({ tenantId, userId, filtros }) {
    const { obrasSelecionadas, unidadesSelecionadas } = await resolveScope(tenantId, userId, filtros);
    const fLot = buildMixedFilter(obrasSelecionadas, unidadesSelecionadas, 'fl.id_obra', 'fl.id_unidade');
    const fPres = buildMixedFilter(obrasSelecionadas, unidadesSelecionadas, 'p.id_obra', 'p.id_unidade');
    const fTrein = buildMixedFilter(obrasSelecionadas, unidadesSelecionadas, 't.id_obra', 't.id_unidade');

    const [[funcAtivos]]: any = await db.query(
      `
      SELECT COUNT(DISTINCT f.id_funcionario) AS total
      FROM funcionarios f
      LEFT JOIN funcionarios_lotacoes fl ON fl.id_funcionario = f.id_funcionario AND fl.atual = 1
      WHERE f.tenant_id = ?
        AND f.ativo = 1
        AND f.status_funcional = 'ATIVO'
        ${fLot.sql}
      `,
      [tenantId, ...fLot.params]
    );

    const [[pendEnd]]: any = await db.query(
      `
      SELECT COUNT(DISTINCT f.id_funcionario) AS total
      FROM funcionarios f
      LEFT JOIN funcionarios_lotacoes fl ON fl.id_funcionario = f.id_funcionario AND fl.atual = 1
      WHERE f.tenant_id = ?
        AND f.status_cadastro_rh = 'PENDENTE_ENDOSSO'
        ${fLot.sql}
      `,
      [tenantId, ...fLot.params]
    );

    const [[admissoesMes]]: any = await db.query(
      `
      SELECT COUNT(DISTINCT f.id_funcionario) AS total
      FROM funcionarios f
      LEFT JOIN funcionarios_lotacoes fl ON fl.id_funcionario = f.id_funcionario AND fl.atual = 1
      WHERE f.tenant_id = ?
        AND DATE_FORMAT(f.data_admissao, '%Y-%m') = DATE_FORMAT(CURDATE(), '%Y-%m')
        ${fLot.sql}
      `,
      [tenantId, ...fLot.params]
    );

    const [[desligMes]]: any = await db.query(
      `
      SELECT COUNT(DISTINCT f.id_funcionario) AS total
      FROM funcionarios f
      LEFT JOIN funcionarios_lotacoes fl ON fl.id_funcionario = f.id_funcionario AND fl.atual = 1
      WHERE f.tenant_id = ?
        AND f.data_desligamento IS NOT NULL
        AND DATE_FORMAT(f.data_desligamento, '%Y-%m') = DATE_FORMAT(CURDATE(), '%Y-%m')
        ${fLot.sql}
      `,
      [tenantId, ...fLot.params]
    );

    const alertas = await safeRows(
      `
      SELECT tipo, titulo, subtitulo, criticidade
      FROM (
        SELECT
          'CADASTRO_PENDENTE' AS tipo,
          CONCAT('Cadastro pendente de endosso: ', f.nome_completo) AS titulo,
          CONCAT('Matrícula ', f.matricula, ' / admissão ', DATE_FORMAT(f.data_admissao, '%d/%m/%Y')) AS subtitulo,
          'WARNING' AS criticidade,
          1 AS ord
        FROM funcionarios f
        LEFT JOIN funcionarios_lotacoes fl ON fl.id_funcionario = f.id_funcionario AND fl.atual = 1
        WHERE f.tenant_id = ?
          AND f.status_cadastro_rh = 'PENDENTE_ENDOSSO'
          ${fLot.sql}
        UNION ALL
        SELECT
          'PRESENCA_REJEITADA' AS tipo,
          CONCAT('Ficha rejeitada pelo RH #', p.id_presenca) AS titulo,
          CONCAT('Data ', DATE_FORMAT(p.data_referencia, '%d/%m/%Y'), ' / motivo: ', COALESCE(p.motivo_rejeicao_rh, '-')) AS subtitulo,
          'DANGER' AS criticidade,
          2 AS ord
        FROM presencas_cabecalho p
        WHERE p.tenant_id = ?
          AND p.status_presenca = 'REJEITADA_RH'
          ${fPres.sql}
      ) x
      ORDER BY x.ord
      LIMIT 20
      `,
      [tenantId, ...fLot.params, tenantId, ...fPres.params]
    );

    const seriesAdmissoes = await safeRows(
      `
      SELECT DATE_FORMAT(f.data_admissao, '%Y-%m') AS referencia, COUNT(DISTINCT f.id_funcionario) AS total
      FROM funcionarios f
      LEFT JOIN funcionarios_lotacoes fl ON fl.id_funcionario = f.id_funcionario AND fl.atual = 1
      WHERE f.tenant_id = ?
        AND f.data_admissao >= DATE_SUB(CURDATE(), INTERVAL 6 MONTH)
        ${fLot.sql}
      GROUP BY DATE_FORMAT(f.data_admissao, '%Y-%m')
      ORDER BY referencia
      `,
      [tenantId, ...fLot.params]
    );

    const series = (seriesAdmissoes || []).map((r: any) => ({ referencia: r.referencia, admissoes: Number(r.total || 0) }));

    const data: DashboardExportDataDTO = {
      titulo: 'Relatório Dashboard RH',
      subtitulo: 'Indicadores operacionais e pendências',
      filtrosAplicados: mapFiltrosBase(filtros),
      cards: [
        { label: 'Funcionários ativos', valor: Number(funcAtivos.total || 0) },
        { label: 'Pendentes endosso', valor: Number(pendEnd.total || 0) },
        { label: 'Admissões mês', valor: Number(admissoesMes.total || 0) },
        { label: 'Desligamentos mês', valor: Number(desligMes.total || 0) },
      ],
      alertas: alertas.map((a: any) => ({ tipo: a.tipo, titulo: a.titulo, subtitulo: a.subtitulo, criticidade: a.criticidade })),
      series,
    };
    return data;
  },
};

export const sstExportProvider: DashboardExportProvider = {
  contexto: 'SST',
  requiredPermission: PERMISSIONS.SST_PAINEL_VIEW,
  async build({ tenantId, userId, filtros }) {
    const { obrasSelecionadas, unidadesSelecionadas } = await resolveScope(tenantId, userId, filtros);
    const fNc = buildMixedFilter(obrasSelecionadas, unidadesSelecionadas, 'nc.id_obra', 'nc.id_unidade');
    const fAc = buildMixedFilter(obrasSelecionadas, unidadesSelecionadas, 'a.id_obra', 'a.id_unidade');
    const fTrein = buildMixedFilter(obrasSelecionadas, unidadesSelecionadas, 't.id_obra', 't.id_unidade');

    const ncsCriticas = await safeTotal(
      `
      SELECT COUNT(*) AS total
      FROM sst_nao_conformidades nc
      WHERE nc.tenant_id = ?
        AND nc.status_nc IN ('ABERTA','EM_TRATAMENTO','AGUARDANDO_VALIDACAO')
        AND nc.severidade IN ('ALTA','CRITICA')
        ${fNc.sql}
      `,
      [tenantId, ...fNc.params]
    );

    const acidentes90d = await safeTotal(
      `
      SELECT COUNT(*) AS total
      FROM sst_acidentes a
      WHERE a.tenant_id = ?
        AND a.data_hora_ocorrencia >= DATE_SUB(CURDATE(), INTERVAL 90 DAY)
        ${fAc.sql}
      `,
      [tenantId, ...fAc.params]
    );

    const treinamentosVencidos = await safeTotal(
      `
      SELECT COUNT(*) AS total
      FROM sst_treinamentos_participantes p
      INNER JOIN sst_treinamentos_turmas t ON t.id_treinamento_turma = p.id_treinamento_turma
      WHERE t.tenant_id = ?
        AND p.validade_ate IS NOT NULL
        AND p.validade_ate < CURDATE()
        ${fTrein.sql}
      `,
      [tenantId, ...fTrein.params]
    );

    const alertas = await safeRows(
      `
      SELECT
        'NC_CRITICA' AS tipo,
        CONCAT('NC crítica #', nc.id_nc) AS titulo,
        CONCAT('Status ', nc.status_nc) AS subtitulo,
        'DANGER' AS criticidade
      FROM sst_nao_conformidades nc
      WHERE nc.tenant_id = ?
        AND nc.status_nc IN ('ABERTA','EM_TRATAMENTO','AGUARDANDO_VALIDACAO')
        AND nc.severidade IN ('ALTA','CRITICA')
        ${fNc.sql}
      ORDER BY COALESCE(nc.prazo_correcao, '2999-12-31') ASC, nc.id_nc DESC
      LIMIT 20
      `,
      [tenantId, ...fNc.params]
    );

    const data: DashboardExportDataDTO = {
      titulo: 'Relatório Painel SST',
      subtitulo: 'Indicadores e alertas críticos',
      filtrosAplicados: mapFiltrosBase(filtros),
      cards: [
        { label: 'NCs críticas', valor: ncsCriticas },
        { label: 'Acidentes 90d', valor: acidentes90d },
        { label: 'Treinamentos vencidos', valor: treinamentosVencidos },
      ],
      alertas: alertas.map((a: any) => ({ tipo: a.tipo, titulo: a.titulo, subtitulo: a.subtitulo, criticidade: a.criticidade })),
    };
    return data;
  },
};

export const suprimentosExportProvider: DashboardExportProvider = {
  contexto: 'SUPRIMENTOS',
  requiredPermission: PERMISSIONS.DASHBOARD_SUPRIMENTOS_VIEW,
  async build({ tenantId, userId, filtros }) {
    const { obrasSelecionadas, unidadesSelecionadas } = await resolveScope(tenantId, userId, filtros);
    const fSolic = buildMixedFilter(obrasSelecionadas, unidadesSelecionadas, 's.id_obra_origem', 's.id_unidade_origem');

    const solicitacoesAbertas = await safeTotal(
      `
      SELECT COUNT(*) AS total
      FROM solicitacao_material s
      WHERE s.tenant_id = ?
        AND s.status_solicitacao NOT IN ('RECEBIDA', 'CANCELADA')
        ${fSolic.sql}
      `,
      [tenantId, ...fSolic.params]
    );

    const solicitacoesUrgentes = await safeTotal(
      `
      SELECT COUNT(*) AS total
      FROM solicitacao_material s
      WHERE s.tenant_id = ?
        AND s.regime_urgencia IN ('URGENTE', 'EMERGENCIAL')
        AND s.status_solicitacao NOT IN ('RECEBIDA', 'CANCELADA')
        ${fSolic.sql}
      `,
      [tenantId, ...fSolic.params]
    );

    const itensAbaixoMinimo = await safeTotal(
      `
      SELECT COUNT(*) AS total
      FROM estoque_saldos s
      WHERE s.tenant_id = ?
        AND s.estoque_minimo IS NOT NULL
        AND s.saldo_atual < s.estoque_minimo
      `,
      [tenantId]
    );

    const entregasAtrasadas = await safeTotal(
      `
      SELECT COUNT(*) AS total
      FROM compras_pedidos p
      WHERE p.tenant_id = ?
        AND p.data_prevista_entrega IS NOT NULL
        AND p.data_prevista_entrega < CURDATE()
        AND COALESCE(p.status, '') NOT IN ('RECEBIDO', 'CANCELADO', 'CONCLUIDO')
      `,
      [tenantId]
    );

    const alertas = await safeRows(
      `
      SELECT tipo, titulo, subtitulo, criticidade
      FROM (
        SELECT
          'SOLICITACAO_URGENTE' AS tipo,
          CONCAT('Solicitação urgente #', s.id_solicitacao_material) AS titulo,
          CONCAT('Status ', s.status_solicitacao, ' / ', s.regime_urgencia) AS subtitulo,
          CASE WHEN s.regime_urgencia = 'EMERGENCIAL' THEN 'CRITICA' ELSE 'ALTA' END AS criticidade,
          1 AS ord
        FROM solicitacao_material s
        WHERE s.tenant_id = ?
          AND s.regime_urgencia IN ('URGENTE', 'EMERGENCIAL')
          AND s.status_solicitacao NOT IN ('RECEBIDA', 'CANCELADA')
          ${fSolic.sql}
        UNION ALL
        SELECT
          'ESTOQUE_MINIMO' AS tipo,
          CONCAT('Estoque abaixo do mínimo: ', COALESCE(i.descricao, i.codigo)) AS titulo,
          CONCAT('Saldo ', e.saldo_atual, ' / mínimo ', e.estoque_minimo) AS subtitulo,
          'ALTA' AS criticidade,
          2 AS ord
        FROM estoque_saldos e
        INNER JOIN estoque_itens i ON i.id_item = e.id_item
        WHERE e.tenant_id = ?
          AND e.estoque_minimo IS NOT NULL
          AND e.saldo_atual < e.estoque_minimo
        UNION ALL
        SELECT
          'ENTREGA_ATRASADA' AS tipo,
          CONCAT('Entrega atrasada: ', p.numero_pedido) AS titulo,
          CONCAT('Prevista ', DATE_FORMAT(p.data_prevista_entrega, '%d/%m/%Y'), ' / status ', p.status) AS subtitulo,
          'ALTA' AS criticidade,
          3 AS ord
        FROM compras_pedidos p
        WHERE p.tenant_id = ?
          AND p.data_prevista_entrega IS NOT NULL
          AND p.data_prevista_entrega < CURDATE()
          AND p.status NOT IN ('RECEBIDO', 'CANCELADO')
      ) x
      ORDER BY x.ord
      LIMIT 20
      `,
      [tenantId, ...fSolic.params, tenantId, tenantId]
    );

    const data: DashboardExportDataDTO = {
      titulo: 'Relatório Dashboard Suprimentos',
      subtitulo: 'Solicitações, estoque e compras',
      filtrosAplicados: mapFiltrosBase(filtros),
      cards: [
        { label: 'Solicitações abertas', valor: solicitacoesAbertas },
        { label: 'Solicitações urgentes', valor: solicitacoesUrgentes },
        { label: 'Itens abaixo mínimo', valor: itensAbaixoMinimo },
        { label: 'Entregas atrasadas', valor: entregasAtrasadas },
      ],
      alertas: alertas.map((a: any) => ({ tipo: a.tipo, titulo: a.titulo, subtitulo: a.subtitulo, criticidade: a.criticidade })),
    };
    return data;
  },
};

export const DASHBOARD_EXPORT_PROVIDERS: Record<DashboardExportContexto, DashboardExportProvider | undefined> = {
  ENGENHARIA: engenhariaExportProvider,
  RH: rhExportProvider,
  SST: sstExportProvider,
  SUPRIMENTOS: suprimentosExportProvider,
  GERENTE: undefined,
  DIRETOR: undefined,
  CEO: undefined,
};
