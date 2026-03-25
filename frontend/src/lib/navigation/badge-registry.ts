import { db } from '@/lib/db';
import { PERMISSIONS } from '@/lib/auth/permissions';
import type { BuildMenuBadgesContext, MenuBadgeProvider } from './badges';
import type { MenuBadgesMapDTO } from './types';
import { inClause } from '@/lib/dashboard/scope';

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

function resolveScope(ctx: BuildMenuBadgesContext) {
  const obras = ctx.scope.empresaTotal ? null : ctx.scope.obras || [];
  const unidades = ctx.scope.empresaTotal ? null : ctx.scope.unidades || [];
  return { obras, unidades };
}

export const rhMenuBadgeProvider: MenuBadgeProvider = {
  key: 'rh',
  requiredPermissions: [PERMISSIONS.DASHBOARD_RH_VIEW, PERMISSIONS.RH_FUNCIONARIOS_VIEW, PERMISSIONS.RH_PRESENCAS_VIEW],
  async build(ctx) {
    const { obras, unidades } = resolveScope(ctx);
    const fLot = buildMixedFilter(obras, unidades, 'fl.id_obra', 'fl.id_unidade');
    const fPres = buildMixedFilter(obras, unidades, 'p.id_obra', 'p.id_unidade');
    const fHe = buildMixedFilter(obras, unidades, 'fl.id_obra', 'fl.id_unidade');
    const fTrein = buildMixedFilter(obras, unidades, 't.id_obra', 't.id_unidade');

    const pendenciasEndosso = await safeTotal(
      `
      SELECT COUNT(*) AS total
      FROM funcionarios f
      LEFT JOIN funcionarios_lotacoes fl ON fl.id_funcionario = f.id_funcionario AND fl.atual = 1
      WHERE f.tenant_id = ?
        AND f.status_cadastro_rh = 'PENDENTE_ENDOSSO'
        ${fLot.sql}
      `,
      [ctx.tenantId, ...fLot.params]
    );

    const presencasPendentes = await safeTotal(
      `
      SELECT COUNT(*) AS total
      FROM presencas_cabecalho p
      WHERE p.tenant_id = ?
        AND p.status_presenca IN ('ENVIADA_RH', 'REJEITADA_RH')
        ${fPres.sql}
      `,
      [ctx.tenantId, ...fPres.params]
    );

    const horasExtrasPendentes = await safeTotal(
      `
      SELECT COUNT(*) AS total
      FROM funcionarios_horas_extras he
      INNER JOIN funcionarios_lotacoes fl ON fl.id_funcionario = he.id_funcionario AND fl.atual = 1
      WHERE he.tenant_id = ?
        AND he.status_he IN ('SOLICITADA', 'AUTORIZADA')
        ${fHe.sql}
      `,
      [ctx.tenantId, ...fHe.params]
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
      [ctx.tenantId, ...fTrein.params]
    );

    const totalPainel = pendenciasEndosso + presencasPendentes + horasExtrasPendentes + treinamentosVencidos;

    const badges: MenuBadgesMapDTO = {
      'painel-rh': totalPainel
        ? { value: totalPainel, tone: 'WARNING', tooltip: 'Pendências gerais do RH' }
        : undefined,
      funcionarios: pendenciasEndosso ? { value: pendenciasEndosso, tone: 'WARNING', tooltip: 'Cadastros aguardando endosso' } : undefined,
      presencas: presencasPendentes
        ? { value: presencasPendentes, tone: 'DANGER', tooltip: 'Presenças pendentes/rejeitadas', pulse: true }
        : undefined,
    };

    return badges;
  },
};

export const sstMenuBadgeProvider: MenuBadgeProvider = {
  key: 'sst',
  requiredPermissions: [PERMISSIONS.SST_PAINEL_VIEW],
  async build(ctx) {
    const { obras, unidades } = resolveScope(ctx);
    const fNc = buildMixedFilter(obras, unidades, 'nc.id_obra', 'nc.id_unidade');
    const fAc = buildMixedFilter(obras, unidades, 'a.id_obra', 'a.id_unidade');
    const fTrein = buildMixedFilter(obras, unidades, 't.id_obra', 't.id_unidade');
    const fProg = buildMixedFilter(obras, unidades, 'p.id_obra', 'p.id_unidade');

    const ncsCriticas = await safeTotal(
      `
      SELECT COUNT(*) AS total
      FROM sst_nao_conformidades nc
      WHERE nc.tenant_id = ?
        AND nc.status_nc IN ('ABERTA','EM_TRATAMENTO','AGUARDANDO_VALIDACAO')
        AND nc.severidade IN ('ALTA','CRITICA')
        ${fNc.sql}
      `,
      [ctx.tenantId, ...fNc.params]
    );

    const acidentesAbertos = await safeTotal(
      `
      SELECT COUNT(*) AS total
      FROM sst_acidentes a
      WHERE a.tenant_id = ?
        AND a.status_acidente IN ('ABERTO','EM_INVESTIGACAO','AGUARDANDO_VALIDACAO')
        ${fAc.sql}
      `,
      [ctx.tenantId, ...fAc.params]
    );

    const catsPendentes = await safeTotal(
      `
      SELECT COUNT(*) AS total
      FROM sst_acidentes a
      WHERE a.tenant_id = ?
        AND a.cat_aplicavel = 1
        AND a.cat_registrada = 0
        AND a.status_acidente IN ('ABERTO','EM_INVESTIGACAO','AGUARDANDO_VALIDACAO')
        ${fAc.sql}
      `,
      [ctx.tenantId, ...fAc.params]
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
      [ctx.tenantId, ...fTrein.params]
    );

    const checklistsAtrasados = await safeTotal(
      `
      SELECT COUNT(*) AS total
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
      `,
      [ctx.tenantId, ctx.tenantId, ...fProg.params]
    );

    const totalPainel = ncsCriticas + acidentesAbertos + treinamentosVencidos + checklistsAtrasados + catsPendentes;

    const badges: MenuBadgesMapDTO = {
      'painel-sst': totalPainel ? { value: totalPainel, tone: 'DANGER', tooltip: 'Alertas críticos SST', pulse: true } : undefined,
      'nao-conformidades': ncsCriticas ? { value: ncsCriticas, tone: 'DANGER', tooltip: 'NCs críticas abertas/vencidas', pulse: true } : undefined,
      acidentes: acidentesAbertos ? { value: acidentesAbertos, tone: 'DANGER', tooltip: 'Acidentes em aberto' } : undefined,
      treinamentos: treinamentosVencidos ? { value: treinamentosVencidos, tone: 'WARNING', tooltip: 'Treinamentos vencidos' } : undefined,
      checklists: checklistsAtrasados ? { value: checklistsAtrasados, tone: 'WARNING', tooltip: 'Checklists atrasados' } : undefined,
    };

    return badges;
  },
};

export const suprimentosMenuBadgeProvider: MenuBadgeProvider = {
  key: 'suprimentos',
  requiredPermissions: [PERMISSIONS.DASHBOARD_SUPRIMENTOS_VIEW],
  async build(ctx) {
    const { obras, unidades } = resolveScope(ctx);
    const fSolic = buildMixedFilter(obras, unidades, 's.id_obra_origem', 's.id_unidade_origem');

    const solicitacoesUrgentes = await safeTotal(
      `
      SELECT COUNT(*) AS total
      FROM solicitacao_material s
      WHERE s.tenant_id = ?
        AND s.regime_urgencia IN ('URGENTE', 'EMERGENCIAL')
        AND s.status_solicitacao NOT IN ('RECEBIDA', 'CANCELADA')
        ${fSolic.sql}
      `,
      [ctx.tenantId, ...fSolic.params]
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
      [ctx.tenantId]
    );

    const estoqueCritico = await safeTotal(
      `
      SELECT COUNT(*) AS total
      FROM estoque_saldos s
      WHERE s.tenant_id = ?
        AND s.estoque_minimo IS NOT NULL
        AND s.saldo_atual < s.estoque_minimo
      `,
      [ctx.tenantId]
    );

    const divergenciasReceb = await safeTotal(
      `
      SELECT COUNT(*) AS total
      FROM suprimentos_recebimentos r
      WHERE r.tenant_id = ?
        AND r.status = 'DIVERGENCIA'
      `,
      [ctx.tenantId]
    );

    const total = solicitacoesUrgentes + entregasAtrasadas + estoqueCritico + divergenciasReceb;
    return {
      'painel-suprimentos': total ? { value: total, tone: 'WARNING', tooltip: 'Pendências Suprimentos' } : undefined,
    };
  },
};

export const engenhariaMenuBadgeProvider: MenuBadgeProvider = {
  key: 'engenharia',
  requiredPermissions: [PERMISSIONS.DASHBOARD_ENGENHARIA_VIEW],
  async build(ctx) {
    const obras = ctx.scope.empresaTotal ? null : ctx.scope.obras || [];
    const fObra = buildOnlyFilter(obras, 'o.id_obra');

    const medicoesAtrasadas = await safeTotal(
      `
      SELECT COUNT(DISTINCT m.id_medicao) AS total
      FROM contratos_medicoes m
      INNER JOIN contratos c ON c.id_contrato = m.id_contrato
      INNER JOIN obras o ON o.id_contrato = c.id_contrato
      WHERE c.tenant_id = ?
        AND m.status_medicao IN ('EM_ELABORACAO', 'ENVIADA')
        AND m.data_prevista_envio IS NOT NULL
        AND m.data_prevista_envio < CURDATE()
        ${fObra.sql}
      `,
      [ctx.tenantId, ...fObra.params]
    );

    const contratosVencendo30d = await safeTotal(
      `
      SELECT COUNT(*) AS total
      FROM contratos c
      WHERE c.tenant_id = ?
        AND c.data_fim_previsto IS NOT NULL
        AND c.data_fim_previsto BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 30 DAY)
      `,
      [ctx.tenantId]
    );

    const obrasRiscoAlto = await safeTotal(
      `
      SELECT COUNT(*) AS total
      FROM (
        SELECT
          o.id_obra,
          (COALESCE(med.total, 0) * 2
           + COALESCE(sol.total, 0) * 2
           + COALESCE(nc.total, 0) * 4
           + COALESCE(ac.total, 0) * 5
           + COALESCE(ch.total, 0) * 2) AS score_risco
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
      ) x
      WHERE x.score_risco >= 10
      `,
      [ctx.tenantId, ctx.tenantId, ctx.tenantId, ctx.tenantId, ctx.tenantId, ctx.tenantId, ctx.tenantId, ...fObra.params]
    );

    const total = medicoesAtrasadas + contratosVencendo30d + obrasRiscoAlto;
    return {
      'painel-engenharia': total ? { value: total, tone: 'WARNING', tooltip: 'Pendências Engenharia/Obras' } : undefined,
    };
  },
};

export const adminMenuBadgeProvider: MenuBadgeProvider = {
  key: 'admin',
  requiredPermissions: [PERMISSIONS.BACKUP_VIEW],
  async build(_ctx) {
    return {};
  },
};

export const automacoesMenuBadgeProvider: MenuBadgeProvider = {
  key: 'automacoes',
  requiredPermissions: [PERMISSIONS.AUTOMACOES_VIEW],
  async build(ctx) {
    const tarefasPendentes = await safeTotal(
      `
      SELECT COUNT(*) AS total
      FROM automacoes_tarefas_instancias t
      WHERE t.tenant_id = ?
        AND t.id_usuario_atribuido = ?
        AND t.status_tarefa IN ('PENDENTE','ATRASADA','EM_ANDAMENTO')
      `,
      [ctx.tenantId, ctx.userId]
    );

    const ocorrenciasCriticas = await safeTotal(
      `
      SELECT COUNT(*) AS total
      FROM automacoes_pendencias_ocorrencias o
      WHERE o.tenant_id = ?
        AND o.id_usuario_responsavel_atual = ?
        AND o.status_ocorrencia IN ('ABERTA','ALERTADA','ESCALADA')
        AND o.severidade IN ('ALTA','CRITICA')
      `,
      [ctx.tenantId, ctx.userId]
    );

    const total = tarefasPendentes + ocorrenciasCriticas;
    return {
      automacoes: total ? { value: total, tone: 'WARNING', tooltip: 'Pendências e tarefas automáticas' } : undefined,
    };
  },
};

export const aprovacoesMenuBadgeProvider: MenuBadgeProvider = {
  key: 'aprovacoes',
  requiredPermissions: [PERMISSIONS.APROVACOES_VIEW],
  async build(ctx) {
    const pendentes = await safeTotal(
      `
      SELECT COUNT(*) AS total
      FROM aprovacoes_solicitacoes_etapas_aprovadores a
      INNER JOIN aprovacoes_solicitacoes_etapas e ON e.id_aprovacao_solicitacao_etapa = a.id_aprovacao_solicitacao_etapa
      INNER JOIN aprovacoes_solicitacoes s ON s.id_aprovacao_solicitacao = e.id_aprovacao_solicitacao
      WHERE a.tenant_id = ?
        AND a.id_usuario_aprovador = ?
        AND a.status_aprovador = 'PENDENTE'
        AND s.status_solicitacao IN ('PENDENTE','EM_ANALISE')
      `,
      [ctx.tenantId, ctx.userId]
    );

    return {
      aprovacoes: pendentes ? { value: pendentes, tone: 'WARNING', tooltip: 'Aprovações pendentes', pulse: true } : undefined,
    };
  },
};

export const workflowsMenuBadgeProvider: MenuBadgeProvider = {
  key: 'workflows',
  requiredPermissions: [PERMISSIONS.WORKFLOWS_VIEW],
  async build(ctx) {
    const tarefasPendentes = await safeTotal(
      `
      SELECT COUNT(*) AS total
      FROM workflows_instancias_tarefas t
      WHERE t.tenant_id = ?
        AND t.id_usuario_responsavel = ?
        AND t.status_tarefa = 'PENDENTE'
      `,
      [ctx.tenantId, ctx.userId]
    );

    const instanciasVencidas = await safeTotal(
      `
      SELECT COUNT(*) AS total
      FROM workflows_instancias i
      WHERE i.tenant_id = ?
        AND i.status_instancia = 'ATIVA'
        AND i.vencimento_etapa_em IS NOT NULL
        AND i.vencimento_etapa_em < NOW()
      `,
      [ctx.tenantId]
    );

    const total = tarefasPendentes + instanciasVencidas;

    return {
      workflows: total ? { value: total, tone: instanciasVencidas ? 'DANGER' : 'WARNING', tooltip: 'Workflows pendentes/vencidos', pulse: !!instanciasVencidas } : undefined,
    };
  },
};

export const documentosMenuBadgeProvider: MenuBadgeProvider = {
  key: 'documentos',
  requiredPermissions: [PERMISSIONS.DOCUMENTOS_VIEW],
  async build(ctx) {
    const pendentes = await safeTotal(
      `
      SELECT COUNT(*) AS total
      FROM documentos_fluxos_assinatura f
      INNER JOIN documentos_versoes v ON v.id_documento_versao = f.id_documento_versao
      INNER JOIN documentos_registros d ON d.id_documento_registro = v.id_documento_registro
      WHERE f.tenant_id = ?
        AND f.id_usuario_signatario = ?
        AND f.status_fluxo = 'DISPONIVEL'
        AND d.status_documento IN ('EM_ASSINATURA','ATIVO')
      `,
      [ctx.tenantId, ctx.userId]
    );

    return {
      documentos: pendentes ? { value: pendentes, tone: 'WARNING', tooltip: 'Documentos aguardando sua assinatura', pulse: true } : undefined,
    };
  },
};

export const portalGestorMenuBadgeProvider: MenuBadgeProvider = {
  key: 'portal-gestor',
  requiredPermissions: [PERMISSIONS.PORTAL_GESTOR_VIEW],
  async build(ctx) {
    const { obras, unidades } = resolveScope(ctx);
    const fNc = buildMixedFilter(obras, unidades, 'nc.id_obra', 'nc.id_unidade');
    const fSolic = buildMixedFilter(obras, unidades, 's.id_obra_origem', 's.id_unidade_origem');
    const fChecklist = buildMixedFilter(obras, unidades, 'e.id_obra', 'e.id_unidade');

    const ncsCriticas = await safeTotal(
      `
      SELECT COUNT(*) AS total
      FROM sst_nao_conformidades nc
      WHERE nc.tenant_id = ?
        AND nc.status_nc IN ('ABERTA','EM_TRATAMENTO','AGUARDANDO_VALIDACAO')
        AND nc.severidade IN ('ALTA','CRITICA')
        ${fNc.sql}
      `,
      [ctx.tenantId, ...fNc.params]
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
      [ctx.tenantId, ...fSolic.params]
    );

    const checklistsAtrasados = await safeTotal(
      `
      SELECT COUNT(*) AS total
      FROM sst_checklists_execucoes e
      WHERE e.tenant_id = ?
        AND e.status_execucao <> 'FINALIZADA'
        AND e.data_referencia < CURDATE()
        ${fChecklist.sql}
      `,
      [ctx.tenantId, ...fChecklist.params]
    );

    const total = ncsCriticas + solicitacoesUrgentes + checklistsAtrasados;
    return {
      'portal-gestor': total ? { value: total, tone: ncsCriticas ? 'DANGER' : 'WARNING', tooltip: 'Pendências críticas (escopo)', pulse: !!ncsCriticas } : undefined,
    };
  },
};

export const MENU_BADGE_PROVIDERS: MenuBadgeProvider[] = [
  rhMenuBadgeProvider,
  sstMenuBadgeProvider,
  suprimentosMenuBadgeProvider,
  engenhariaMenuBadgeProvider,
  adminMenuBadgeProvider,
  automacoesMenuBadgeProvider,
  aprovacoesMenuBadgeProvider,
  workflowsMenuBadgeProvider,
  documentosMenuBadgeProvider,
  portalGestorMenuBadgeProvider,
];
