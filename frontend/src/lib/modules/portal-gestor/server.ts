import { db } from '@/lib/db';
import { ApiError } from '@/lib/api/http';
import type { DashboardScope } from '@/lib/dashboard/scope';
import type {
  PortalGestorAgendaDTO,
  PortalGestorEquipeItemDTO,
  PortalGestorPendenciaDTO,
  PortalGestorResumoDTO,
  PortalGestorSstLocalDTO,
  PortalGestorSuprimentosDTO,
  PortalGestorTipoLocal,
} from './types';
import type { PortalGestorFiltros } from './scope';
import { buildAtalhosPortalGestor } from './atalhos';

function buildMixedFilter(tipoLocal: PortalGestorTipoLocal, idObra: number | null, idUnidade: number | null, obraAlias: string, unidadeAlias: string) {
  if (tipoLocal === 'OBRA') return { sql: ` AND ${obraAlias} = ?`, params: [Number(idObra || 0)] };
  return { sql: ` AND ${unidadeAlias} = ?`, params: [Number(idUnidade || 0)] };
}

function buildTipoLocalFilter(tipoLocal: PortalGestorTipoLocal, idObra: number | null, idUnidade: number | null, tipoField: string, obraField: string, unidadeField: string) {
  if (tipoLocal === 'OBRA') return { sql: ` AND ${tipoField} = 'OBRA' AND ${obraField} = ?`, params: [Number(idObra || 0)] };
  return { sql: ` AND ${tipoField} = 'UNIDADE' AND ${unidadeField} = ?`, params: [Number(idUnidade || 0)] };
}

async function safeTotal(sql: string, params: any[]) {
  try {
    const [[row]]: any = await db.query(sql, params);
    return Number(row?.total || 0);
  } catch {
    return 0;
  }
}

async function safeScalar(sql: string, params: any[]) {
  try {
    const [[row]]: any = await db.query(sql, params);
    return row || null;
  } catch {
    return null;
  }
}

function todayIsoDate() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

async function resolveLocalNome(tenantId: number, filtros: PortalGestorFiltros): Promise<string> {
  if (filtros.tipoLocal === 'OBRA') {
    const id = Number(filtros.idObra || 0);
    const row = await safeScalar(
      `
      SELECT CONCAT('Obra #', o.id_obra) AS nome
      FROM obras o
      INNER JOIN contratos c ON c.id_contrato = o.id_contrato
      WHERE c.tenant_id = ? AND o.id_obra = ?
      LIMIT 1
      `,
      [tenantId, id]
    );
    return row?.nome ? String(row.nome) : `Obra #${id}`;
  }

  const id = Number(filtros.idUnidade || 0);
  const row = await safeScalar(
    `
    SELECT nome
    FROM unidades
    WHERE tenant_id = ? AND id_unidade = ?
    LIMIT 1
    `,
    [tenantId, id]
  );
  return row?.nome ? String(row.nome) : `Unidade #${id}`;
}

async function resolveAprovacoesPendentes(tenantId: number, userId: number) {
  return safeTotal(
    `
    SELECT COUNT(*) AS total
    FROM aprovacoes_solicitacoes_etapas_aprovadores a
    INNER JOIN aprovacoes_solicitacoes s ON s.id_aprovacao_solicitacao = a.id_aprovacao_solicitacao
    WHERE a.tenant_id = ?
      AND a.id_usuario_aprovador = ?
      AND a.status_aprovador IN ('PENDENTE','DISPONIVEL')
      AND s.status_solicitacao IN ('EM_ANDAMENTO','ENVIADA')
    `,
    [tenantId, userId]
  );
}

export async function obterResumoPortalGestor(args: {
  tenantId: number;
  userId: number;
  scope: DashboardScope;
  filtros: PortalGestorFiltros;
}): Promise<PortalGestorResumoDTO> {
  const { tenantId, userId, filtros } = args;
  const dataReferencia = filtros.dataReferencia || todayIsoDate();
  const localNome = await resolveLocalNome(tenantId, filtros);

  const equipePrevista = await safeTotal(
    `
    SELECT COUNT(DISTINCT f.id_funcionario) AS total
    FROM funcionarios f
    INNER JOIN funcionarios_lotacoes fl ON fl.id_funcionario = f.id_funcionario AND fl.atual = 1
    WHERE f.tenant_id = ?
      AND f.ativo = 1
      AND f.status_funcional = 'ATIVO'
      AND fl.tipo_lotacao = ?
      AND ( (? = 'OBRA' AND fl.id_obra = ?) OR (? = 'UNIDADE' AND fl.id_unidade = ?) )
    `,
    [tenantId, filtros.tipoLocal, filtros.tipoLocal, filtros.idObra || 0, filtros.tipoLocal, filtros.idUnidade || 0]
  );

  const [[presenca]]: any = await db
    .query(
      `
      SELECT id_presenca AS id
      FROM presencas_cabecalho
      WHERE tenant_id = ?
        AND tipo_local = ?
        AND ( (? = 'OBRA' AND id_obra = ?) OR (? = 'UNIDADE' AND id_unidade = ?) )
        AND data_referencia = ?
      ORDER BY id_presenca DESC
      LIMIT 1
      `,
      [tenantId, filtros.tipoLocal, filtros.tipoLocal, filtros.idObra || 0, filtros.tipoLocal, filtros.idUnidade || 0, dataReferencia]
    )
    .catch(() => [[null]]);

  const idPresenca = presenca?.id ? Number(presenca.id) : null;

  const equipePresente = idPresenca
    ? await safeTotal(
        `
        SELECT COUNT(*) AS total
        FROM presencas_itens i
        WHERE i.id_presenca = ?
          AND i.situacao_presenca = 'PRESENTE'
        `,
        [idPresenca]
      )
    : 0;

  const ausencias = idPresenca
    ? await safeTotal(
        `
        SELECT COUNT(*) AS total
        FROM presencas_itens i
        WHERE i.id_presenca = ?
          AND i.situacao_presenca IS NOT NULL
          AND i.situacao_presenca <> 'PRESENTE'
        `,
        [idPresenca]
      )
    : 0;

  const atrasos = idPresenca
    ? await safeTotal(
        `
        SELECT COUNT(*) AS total
        FROM presencas_itens i
        WHERE i.id_presenca = ?
          AND COALESCE(i.minutos_atraso, 0) > 0
        `,
        [idPresenca]
      )
    : 0;

  const fHe = buildMixedFilter(filtros.tipoLocal, filtros.idObra, filtros.idUnidade, 'fl.id_obra', 'fl.id_unidade');
  const horasExtrasPendentes = await safeTotal(
    `
    SELECT COUNT(*) AS total
    FROM funcionarios_horas_extras he
    INNER JOIN funcionarios_lotacoes fl ON fl.id_funcionario = he.id_funcionario AND fl.atual = 1
    WHERE he.tenant_id = ?
      AND he.status_he IN ('SOLICITADA','AUTORIZADA')
      ${fHe.sql}
    `,
    [tenantId, ...fHe.params]
  );

  const fChecklist = buildMixedFilter(filtros.tipoLocal, filtros.idObra, filtros.idUnidade, 'e.id_obra', 'e.id_unidade');
  const checklistsPendentes = await safeTotal(
    `
    SELECT COUNT(*) AS total
    FROM sst_checklists_execucoes e
    WHERE e.tenant_id = ?
      AND e.status_execucao = 'EM_PREENCHIMENTO'
      AND e.data_referencia = ?
      ${fChecklist.sql}
    `,
    [tenantId, dataReferencia, ...fChecklist.params]
  );

  const fNc = buildMixedFilter(filtros.tipoLocal, filtros.idObra, filtros.idUnidade, 'nc.id_obra', 'nc.id_unidade');
  const ncsCriticasAbertas = await safeTotal(
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

  const fAc = buildMixedFilter(filtros.tipoLocal, filtros.idObra, filtros.idUnidade, 'a.id_obra', 'a.id_unidade');
  const acidentesMes = await safeTotal(
    `
    SELECT COUNT(*) AS total
    FROM sst_acidentes a
    WHERE a.tenant_id = ?
      AND DATE_FORMAT(a.data_hora_ocorrencia, '%Y-%m') = DATE_FORMAT(?, '%Y-%m')
      ${fAc.sql}
    `,
    [tenantId, dataReferencia, ...fAc.params]
  );

  const fSolic = buildMixedFilter(filtros.tipoLocal, filtros.idObra, filtros.idUnidade, 's.id_obra_origem', 's.id_unidade_origem');
  const solicitacoesUrgentes = await safeTotal(
    `
    SELECT COUNT(*) AS total
    FROM solicitacao_material s
    WHERE s.tenant_id = ?
      AND s.regime_urgencia IN ('URGENTE','EMERGENCIAL')
      AND s.status_solicitacao NOT IN ('RECEBIDA','CANCELADA')
      ${fSolic.sql}
    `,
    [tenantId, ...fSolic.params]
  );

  const aprovacoesPendentes = await resolveAprovacoesPendentes(tenantId, userId);

  return {
    tipoLocal: filtros.tipoLocal,
    localId: filtros.tipoLocal === 'OBRA' ? Number(filtros.idObra || 0) : Number(filtros.idUnidade || 0),
    localNome,
    dataReferencia,
    equipePrevista,
    equipePresente,
    ausencias,
    atrasos,
    horasExtrasPendentes,
    checklistsPendentes,
    ncsCriticasAbertas,
    acidentesMes,
    solicitacoesUrgentes,
    aprovacoesPendentes,
  };
}

export async function obterEquipePortalGestor(args: {
  tenantId: number;
  userId: number;
  scope: DashboardScope;
  filtros: PortalGestorFiltros;
}): Promise<PortalGestorEquipeItemDTO[]> {
  const { tenantId, filtros } = args;
  const dataReferencia = filtros.dataReferencia || todayIsoDate();

  const [[presenca]]: any = await db
    .query(
      `
      SELECT id_presenca AS id
      FROM presencas_cabecalho
      WHERE tenant_id = ?
        AND tipo_local = ?
        AND ( (? = 'OBRA' AND id_obra = ?) OR (? = 'UNIDADE' AND id_unidade = ?) )
        AND data_referencia = ?
      ORDER BY id_presenca DESC
      LIMIT 1
      `,
      [tenantId, filtros.tipoLocal, filtros.tipoLocal, filtros.idObra || 0, filtros.tipoLocal, filtros.idUnidade || 0, dataReferencia]
    )
    .catch(() => [[null]]);
  const idPresenca = presenca?.id ? Number(presenca.id) : null;

  const lotFilter = filtros.tipoLocal === 'OBRA' ? `fl.tipo_lotacao = 'OBRA' AND fl.id_obra = ?` : `fl.tipo_lotacao = 'UNIDADE' AND fl.id_unidade = ?`;
  const lotParam = filtros.tipoLocal === 'OBRA' ? Number(filtros.idObra || 0) : Number(filtros.idUnidade || 0);

  try {
    const [rows]: any = await db.query(
      `
      SELECT
        f.id_funcionario AS idFuncionario,
        f.nome_completo AS nome,
        f.matricula AS matricula,
        COALESCE(c.nome_cargo, f.cargo_contratual) AS cargoNome,
        COALESCE(s.nome_setor, f.setor_nome) AS setorNome,
        pi.situacao_presenca AS situacaoPresenca,
        pi.hora_entrada AS horaEntrada,
        pi.hora_saida AS horaSaida,
        CASE
          WHEN pi.requer_assinatura_funcionario = 1 AND pi.assinado_funcionario = 0 AND (pi.motivo_sem_assinatura IS NULL OR pi.motivo_sem_assinatura = '') THEN 1
          ELSE 0
        END AS assinaturaPendente,
        CASE
          WHEN EXISTS (
            SELECT 1
            FROM sst_treinamentos_participantes p
            INNER JOIN sst_treinamentos_turmas t ON t.id_turma = p.id_turma
            WHERE p.tenant_id = ?
              AND p.id_funcionario = f.id_funcionario
              AND p.status_participacao = 'CONCLUIDO'
              AND p.validade_ate IS NOT NULL
              AND p.validade_ate < ?
              LIMIT 1
          ) THEN 1
          ELSE 0
        END AS treinamentoVencido,
        CASE
          WHEN EXISTS (
            SELECT 1
            FROM sst_epi_fichas ef
            INNER JOIN sst_epi_fichas_itens ei ON ei.id_ficha = ef.id_ficha
            WHERE ef.tenant_id = ?
              AND ef.id_funcionario = f.id_funcionario
              AND ei.status_item = 'ENTREGUE'
              AND (
                (ei.data_prevista_troca IS NOT NULL AND ei.data_prevista_troca < ?)
                OR
                (ei.ca_validade IS NOT NULL AND ei.ca_validade < ?)
              )
              LIMIT 1
          ) THEN 1
          ELSE 0
        END AS epiPendente
      FROM funcionarios f
      INNER JOIN funcionarios_lotacoes fl ON fl.id_funcionario = f.id_funcionario AND fl.atual = 1
      LEFT JOIN organizacao_cargos c ON c.id_cargo = f.id_cargo_contratual
      LEFT JOIN organizacao_setores s ON s.id_setor = f.id_setor
      LEFT JOIN presencas_itens pi ON pi.id_presenca = ? AND pi.id_funcionario = f.id_funcionario
      WHERE f.tenant_id = ?
        AND f.ativo = 1
        AND f.status_funcional = 'ATIVO'
        AND ${lotFilter}
      ORDER BY f.nome_completo
      `,
      [tenantId, dataReferencia, tenantId, dataReferencia, dataReferencia, idPresenca || 0, tenantId, lotParam]
    );

    return (rows as any[]).map((r) => ({
      idFuncionario: Number(r.idFuncionario),
      nome: String(r.nome),
      matricula: r.matricula ? String(r.matricula) : null,
      cargoNome: r.cargoNome ? String(r.cargoNome) : null,
      setorNome: r.setorNome ? String(r.setorNome) : null,
      situacaoPresenca: r.situacaoPresenca ? String(r.situacaoPresenca) : null,
      horaEntrada: r.horaEntrada ? String(r.horaEntrada) : null,
      horaSaida: r.horaSaida ? String(r.horaSaida) : null,
      assinaturaPendente: Boolean(r.assinaturaPendente),
      treinamentoVencido: Boolean(r.treinamentoVencido),
      epiPendente: Boolean(r.epiPendente),
    }));
  } catch {
    return [];
  }
}

export async function obterPendenciasPortalGestor(args: {
  tenantId: number;
  userId: number;
  scope: DashboardScope;
  filtros: PortalGestorFiltros;
}): Promise<PortalGestorPendenciaDTO[]> {
  const { tenantId, userId, filtros } = args;
  const dataReferencia = filtros.dataReferencia || todayIsoDate();

  const pendencias: PortalGestorPendenciaDTO[] = [];

  const fPres = buildTipoLocalFilter(filtros.tipoLocal, filtros.idObra, filtros.idUnidade, 'p.tipo_local', 'p.id_obra', 'p.id_unidade');
  const presencasPendentesAssinatura = await safeTotal(
    `
    SELECT COUNT(*) AS total
    FROM presencas_itens i
    INNER JOIN presencas_cabecalho p ON p.id_presenca = i.id_presenca
    WHERE p.tenant_id = ?
      AND p.data_referencia = ?
      ${fPres.sql}
      AND i.requer_assinatura_funcionario = 1
      AND i.assinado_funcionario = 0
      AND (i.motivo_sem_assinatura IS NULL OR i.motivo_sem_assinatura = '')
    `,
    [tenantId, dataReferencia, ...fPres.params]
  );
  if (presencasPendentesAssinatura) {
    pendencias.push({
      tipo: 'PRESENCA',
      titulo: 'Assinaturas pendentes na presença',
      subtitulo: `${presencasPendentesAssinatura} itens pendentes`,
      criticidade: 'ALTA',
      referenciaId: null,
      rota: '/dashboard/rh/presencas',
      prazoEm: `${dataReferencia}T23:59:59Z`,
    });
  }

  const fChecklist = buildMixedFilter(filtros.tipoLocal, filtros.idObra, filtros.idUnidade, 'e.id_obra', 'e.id_unidade');
  const checklistsAtrasados = await safeTotal(
    `
    SELECT COUNT(*) AS total
    FROM sst_checklists_execucoes e
    WHERE e.tenant_id = ?
      AND e.status_execucao <> 'FINALIZADA'
      AND e.data_referencia < ?
      ${fChecklist.sql}
    `,
    [tenantId, dataReferencia, ...fChecklist.params]
  );
  if (checklistsAtrasados) {
    pendencias.push({
      tipo: 'CHECKLIST',
      titulo: 'Checklists SST atrasados',
      subtitulo: `${checklistsAtrasados} execuções em atraso`,
      criticidade: 'ALTA',
      referenciaId: null,
      rota: '/dashboard/sst/checklists',
      prazoEm: null,
    });
  }

  const fNc = buildMixedFilter(filtros.tipoLocal, filtros.idObra, filtros.idUnidade, 'nc.id_obra', 'nc.id_unidade');
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
  if (ncsCriticas) {
    pendencias.push({
      tipo: 'NC',
      titulo: 'NCs críticas abertas',
      subtitulo: `${ncsCriticas} pendências críticas`,
      criticidade: 'CRITICA',
      referenciaId: null,
      rota: '/dashboard/sst/nao-conformidades',
      prazoEm: null,
    });
  }

  const fTrein = buildMixedFilter(filtros.tipoLocal, filtros.idObra, filtros.idUnidade, 'fl.id_obra', 'fl.id_unidade');
  const treinamentosVencidos = await safeTotal(
    `
    SELECT COUNT(DISTINCT p.id_funcionario) AS total
    FROM sst_treinamentos_participantes p
    INNER JOIN sst_treinamentos_turmas t ON t.id_turma = p.id_turma
    INNER JOIN funcionarios_lotacoes fl ON fl.id_funcionario = p.id_funcionario AND fl.atual = 1
    WHERE p.tenant_id = ?
      AND p.status_participacao = 'CONCLUIDO'
      AND p.validade_ate IS NOT NULL
      AND p.validade_ate < ?
      ${fTrein.sql}
    `,
    [tenantId, dataReferencia, ...fTrein.params]
  );
  if (treinamentosVencidos) {
    pendencias.push({
      tipo: 'TREINAMENTO',
      titulo: 'Treinamentos vencidos na equipe',
      subtitulo: `${treinamentosVencidos} funcionários com vencimento`,
      criticidade: 'ALTA',
      referenciaId: null,
      rota: '/dashboard/sst/treinamentos',
      prazoEm: null,
    });
  }

  const episTrocaVencida = await safeTotal(
    `
    SELECT COUNT(DISTINCT ef.id_funcionario) AS total
    FROM sst_epi_fichas ef
    INNER JOIN sst_epi_fichas_itens ei ON ei.id_ficha = ef.id_ficha
    INNER JOIN funcionarios_lotacoes fl ON fl.id_funcionario = ef.id_funcionario AND fl.atual = 1
    WHERE ef.tenant_id = ?
      AND ei.status_item = 'ENTREGUE'
      AND (
        (ei.data_prevista_troca IS NOT NULL AND ei.data_prevista_troca < ?)
        OR
        (ei.ca_validade IS NOT NULL AND ei.ca_validade < ?)
      )
      ${fTrein.sql}
    `,
    [tenantId, dataReferencia, dataReferencia, ...fTrein.params]
  );
  if (episTrocaVencida) {
    pendencias.push({
      tipo: 'EPI',
      titulo: 'EPI com troca vencida',
      subtitulo: `${episTrocaVencida} funcionários com pendência`,
      criticidade: 'MEDIA',
      referenciaId: null,
      rota: '/dashboard/sst/epi',
      prazoEm: null,
    });
  }

  const fSolic = buildMixedFilter(filtros.tipoLocal, filtros.idObra, filtros.idUnidade, 's.id_obra_origem', 's.id_unidade_origem');
  const solicitacoesUrgentes = await safeTotal(
    `
    SELECT COUNT(*) AS total
    FROM solicitacao_material s
    WHERE s.tenant_id = ?
      AND s.regime_urgencia IN ('URGENTE','EMERGENCIAL')
      AND s.status_solicitacao NOT IN ('RECEBIDA','CANCELADA')
      ${fSolic.sql}
    `,
    [tenantId, ...fSolic.params]
  );
  if (solicitacoesUrgentes) {
    pendencias.push({
      tipo: 'SUPRIMENTOS',
      titulo: 'Solicitações urgentes',
      subtitulo: `${solicitacoesUrgentes} solicitações abertas`,
      criticidade: 'ALTA',
      referenciaId: null,
      rota: '/dashboard/suprimentos/solicitacoes',
      prazoEm: null,
    });
  }

  const aprovacoesPendentes = await resolveAprovacoesPendentes(tenantId, userId);
  if (aprovacoesPendentes) {
    pendencias.push({
      tipo: 'APROVACAO',
      titulo: 'Aprovações aguardando você',
      subtitulo: `${aprovacoesPendentes} pendências`,
      criticidade: 'MEDIA',
      referenciaId: null,
      rota: '/dashboard/aprovacoes',
      prazoEm: null,
    });
  }

  let workflowsPendentes = 0;
  try {
    workflowsPendentes = await safeTotal(
      `
      SELECT COUNT(*) AS total
      FROM workflows_instancias_tarefas t
      INNER JOIN workflows_instancias i ON i.id_workflow_instancia = t.id_workflow_instancia
      WHERE t.tenant_id = ?
        AND t.id_usuario_executor = ?
        AND t.status_tarefa = 'PENDENTE'
        AND i.status_instancia = 'ATIVA'
      `,
      [tenantId, userId]
    );
  } catch {}
  if (workflowsPendentes) {
    pendencias.push({
      tipo: 'WORKFLOW',
      titulo: 'Tarefas de workflow pendentes',
      subtitulo: `${workflowsPendentes} tarefas`,
      criticidade: 'MEDIA',
      referenciaId: null,
      rota: '/dashboard/workflows',
      prazoEm: null,
    });
  }

  pendencias.sort((a, b) => {
    const prio = (c: any) => (c === 'CRITICA' ? 4 : c === 'ALTA' ? 3 : c === 'MEDIA' ? 2 : 1);
    return prio(b.criticidade) - prio(a.criticidade);
  });

  return pendencias.slice(0, 30);
}

export async function obterAgendaPortalGestor(args: { tenantId: number; userId: number; scope: DashboardScope; filtros: PortalGestorFiltros }): Promise<PortalGestorAgendaDTO[]> {
  const { tenantId, filtros } = args;
  const dataReferencia = filtros.dataReferencia || todayIsoDate();
  const agenda: PortalGestorAgendaDTO[] = [];

  const fChecklist = buildMixedFilter(filtros.tipoLocal, filtros.idObra, filtros.idUnidade, 'e.id_obra', 'e.id_unidade');
  try {
    const [rows]: any = await db.query(
      `
      SELECT e.id_execucao_checklist AS id, e.status_execucao AS status, e.data_referencia AS dataRef
      FROM sst_checklists_execucoes e
      WHERE e.tenant_id = ?
        AND e.data_referencia = ?
        AND e.status_execucao <> 'FINALIZADA'
        ${fChecklist.sql}
      ORDER BY e.id_execucao_checklist DESC
      LIMIT 10
      `,
      [tenantId, dataReferencia, ...fChecklist.params]
    );
    for (const r of rows as any[]) {
      agenda.push({
        titulo: `Checklist SST #${Number(r.id)}`,
        tipo: 'CHECKLIST',
        horario: null,
        prazoEm: `${dataReferencia}T23:59:59Z`,
        rota: '/dashboard/sst/checklists',
        status: r.status ? String(r.status) : null,
      });
    }
  } catch {}

  return agenda;
}

export async function obterAtalhosPortalGestor(args: { current: any; filtros: PortalGestorFiltros }) {
  return buildAtalhosPortalGestor({
    current: args.current,
    tipoLocal: args.filtros.tipoLocal,
    idObra: args.filtros.idObra,
    idUnidade: args.filtros.idUnidade,
  });
}

export async function obterSstLocalPortalGestor(args: { tenantId: number; filtros: PortalGestorFiltros }): Promise<PortalGestorSstLocalDTO> {
  const { tenantId, filtros } = args;
  const dataReferencia = filtros.dataReferencia || todayIsoDate();

  const fNc = buildMixedFilter(filtros.tipoLocal, filtros.idObra, filtros.idUnidade, 'nc.id_obra', 'nc.id_unidade');
  const fAc = buildMixedFilter(filtros.tipoLocal, filtros.idObra, filtros.idUnidade, 'a.id_obra', 'a.id_unidade');
  const fChecklist = buildMixedFilter(filtros.tipoLocal, filtros.idObra, filtros.idUnidade, 'e.id_obra', 'e.id_unidade');
  const fTrein = buildMixedFilter(filtros.tipoLocal, filtros.idObra, filtros.idUnidade, 'fl.id_obra', 'fl.id_unidade');

  const ncsAbertas = await safeTotal(
    `
    SELECT COUNT(*) AS total
    FROM sst_nao_conformidades nc
    WHERE nc.tenant_id = ?
      AND nc.status_nc IN ('ABERTA','EM_TRATAMENTO','AGUARDANDO_VALIDACAO')
      ${fNc.sql}
    `,
    [tenantId, ...fNc.params]
  );

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
      AND a.data_hora_ocorrencia >= DATE_SUB(?, INTERVAL 90 DAY)
      ${fAc.sql}
    `,
    [tenantId, dataReferencia, ...fAc.params]
  );

  const checklistsAtrasados = await safeTotal(
    `
    SELECT COUNT(*) AS total
    FROM sst_checklists_execucoes e
    WHERE e.tenant_id = ?
      AND e.status_execucao <> 'FINALIZADA'
      AND e.data_referencia < ?
      ${fChecklist.sql}
    `,
    [tenantId, dataReferencia, ...fChecklist.params]
  );

  const treinamentosVencidos = await safeTotal(
    `
    SELECT COUNT(DISTINCT p.id_funcionario) AS total
    FROM sst_treinamentos_participantes p
    INNER JOIN sst_treinamentos_turmas t ON t.id_turma = p.id_turma
    INNER JOIN funcionarios_lotacoes fl ON fl.id_funcionario = p.id_funcionario AND fl.atual = 1
    WHERE p.tenant_id = ?
      AND p.status_participacao = 'CONCLUIDO'
      AND p.validade_ate IS NOT NULL
      AND p.validade_ate < ?
      ${fTrein.sql}
    `,
    [tenantId, dataReferencia, ...fTrein.params]
  );

  const episTrocaVencida = await safeTotal(
    `
    SELECT COUNT(DISTINCT ef.id_funcionario) AS total
    FROM sst_epi_fichas ef
    INNER JOIN sst_epi_fichas_itens ei ON ei.id_ficha = ef.id_ficha
    INNER JOIN funcionarios_lotacoes fl ON fl.id_funcionario = ef.id_funcionario AND fl.atual = 1
    WHERE ef.tenant_id = ?
      AND ei.status_item = 'ENTREGUE'
      AND (
        (ei.data_prevista_troca IS NOT NULL AND ei.data_prevista_troca < ?)
        OR
        (ei.ca_validade IS NOT NULL AND ei.ca_validade < ?)
      )
      ${fTrein.sql}
    `,
    [tenantId, dataReferencia, dataReferencia, ...fTrein.params]
  );

  return { checklistsAtrasados, ncsAbertas, ncsCriticas, acidentes90d, treinamentosVencidos, episTrocaVencida };
}

export async function obterSuprimentosLocalPortalGestor(args: { tenantId: number; filtros: PortalGestorFiltros }): Promise<PortalGestorSuprimentosDTO> {
  const { tenantId, filtros } = args;

  const fSolic = buildMixedFilter(filtros.tipoLocal, filtros.idObra, filtros.idUnidade, 's.id_obra_origem', 's.id_unidade_origem');

  const solicitacoesAbertas = await safeTotal(
    `
    SELECT COUNT(*) AS total
    FROM solicitacao_material s
    WHERE s.tenant_id = ?
      AND s.status_solicitacao NOT IN ('RECEBIDA','CANCELADA')
      ${fSolic.sql}
    `,
    [tenantId, ...fSolic.params]
  );

  const solicitacoesUrgentes = await safeTotal(
    `
    SELECT COUNT(*) AS total
    FROM solicitacao_material s
    WHERE s.tenant_id = ?
      AND s.regime_urgencia IN ('URGENTE','EMERGENCIAL')
      AND s.status_solicitacao NOT IN ('RECEBIDA','CANCELADA')
      ${fSolic.sql}
    `,
    [tenantId, ...fSolic.params]
  );

  const entregasAtrasadas = await safeTotal(
    `
    SELECT COUNT(*) AS total
    FROM compras_pedidos p
    WHERE p.tenant_id = ?
      AND p.data_prevista_entrega IS NOT NULL
      AND p.data_prevista_entrega < CURDATE()
      AND COALESCE(p.status, '') NOT IN ('RECEBIDO','CANCELADO','CONCLUIDO')
    `,
    [tenantId]
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

  let ultimaMovimentacaoEm: string | null = null;
  try {
    const [[row]]: any = await db.query(
      `
      SELECT MAX(created_at) AS dt
      FROM estoque_movimentacoes
      WHERE tenant_id = ?
      `,
      [tenantId]
    );
    if (row?.dt) ultimaMovimentacaoEm = new Date(row.dt).toISOString();
  } catch {
    ultimaMovimentacaoEm = null;
  }

  return { solicitacoesAbertas, solicitacoesUrgentes, entregasAtrasadas, itensAbaixoMinimo, ultimaMovimentacaoEm };
}

export async function assertPortalScopeHasLocal(scope: DashboardScope) {
  if (scope.empresaTotal) return;
  if (!scope.obras.length && !scope.unidades.length) throw new ApiError(403, 'Usuário sem escopo de obra/unidade.');
}

