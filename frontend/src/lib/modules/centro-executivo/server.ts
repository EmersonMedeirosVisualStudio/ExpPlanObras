import { db } from '@/lib/db';
import { getDashboardScope, inClause } from '@/lib/dashboard/scope';
import type {
  CentroExecutivoAlertaDTO,
  CentroExecutivoComparativoDTO,
  CentroExecutivoFiltrosDTO,
  CentroExecutivoMatrizLinhaDTO,
  CentroExecutivoRankingObraDTO,
  CentroExecutivoResumoDTO,
  CentroExecutivoSerieDTO,
} from './types';
import { scoreDimensao, scoreGlobal, scoreRiscoObra, scoreSaudeExecutiva } from './score';

type Ctx = { tenantId: number; userId: number; permissions: string[] };

function parseFiltros(url: URL): CentroExecutivoFiltrosDTO {
  const idDiretoria = Number(url.searchParams.get('idDiretoria') || 0) || undefined;
  const idObra = Number(url.searchParams.get('idObra') || 0) || undefined;
  const idUnidade = Number(url.searchParams.get('idUnidade') || 0) || undefined;
  const periodo = url.searchParams.get('periodo') ? (String(url.searchParams.get('periodo')) as any) : undefined;
  const dataInicial = url.searchParams.get('dataInicial') ? String(url.searchParams.get('dataInicial')) : undefined;
  const dataFinal = url.searchParams.get('dataFinal') ? String(url.searchParams.get('dataFinal')) : undefined;
  const recorte = url.searchParams.get('recorte') ? (String(url.searchParams.get('recorte')) as any) : undefined;
  return { idDiretoria, idObra, idUnidade, periodo, dataInicial, dataFinal, recorte };
}

function buildDateRange(f: CentroExecutivoFiltrosDTO) {
  const now = new Date();
  const periodo = f.periodo || 'ULTIMOS_6_MESES';
  if (periodo === 'PERSONALIZADO' && f.dataInicial && f.dataFinal) {
    return { dataInicial: f.dataInicial, dataFinal: f.dataFinal };
  }
  if (periodo === 'MES_ATUAL') {
    const di = new Date(now.getFullYear(), now.getMonth(), 1);
    const df = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return { dataInicial: di.toISOString().slice(0, 10), dataFinal: df.toISOString().slice(0, 10) };
  }
  if (periodo === 'ULTIMOS_3_MESES') {
    const di = new Date(now.getFullYear(), now.getMonth() - 2, 1);
    return { dataInicial: di.toISOString().slice(0, 10), dataFinal: now.toISOString().slice(0, 10) };
  }
  if (periodo === 'ANO_ATUAL') {
    const di = new Date(now.getFullYear(), 0, 1);
    return { dataInicial: di.toISOString().slice(0, 10), dataFinal: now.toISOString().slice(0, 10) };
  }
  const di = new Date(now.getFullYear(), now.getMonth() - 5, 1);
  return { dataInicial: di.toISOString().slice(0, 10), dataFinal: now.toISOString().slice(0, 10) };
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

async function safeFinanceiro(sql: string, params: any[]) {
  try {
    const [[row]]: any = await db.query(sql, params);
    return {
      valorContratado: Number(row?.valorContratado || 0),
      valorExecutado: Number(row?.valorExecutado || 0),
      valorPago: Number(row?.valorPago || 0),
    };
  } catch {
    return { valorContratado: 0, valorExecutado: 0, valorPago: 0 };
  }
}

function assertWithinScope(scope: { empresaTotal: boolean; diretorias: number[]; obras: number[]; unidades: number[] }, f: CentroExecutivoFiltrosDTO) {
  if (scope.empresaTotal) return;
  if (f.idDiretoria && !scope.diretorias.includes(f.idDiretoria)) throw new Error('Diretoria fora da abrangência');
  if (f.idObra && !scope.obras.includes(f.idObra)) throw new Error('Obra fora da abrangência');
  if (f.idUnidade && !scope.unidades.includes(f.idUnidade)) throw new Error('Unidade fora da abrangência');
}

function buildDiretoriaFilter(scope: { empresaTotal: boolean; diretorias: number[] }, f: CentroExecutivoFiltrosDTO) {
  if (f.idDiretoria) return { sql: ' AND c.id_setor_diretoria = ?', params: [f.idDiretoria] as any[] };
  if (scope.empresaTotal) return { sql: '', params: [] as any[] };
  if (!scope.diretorias.length) return { sql: ' AND 1 = 0', params: [] as any[] };
  const c = inClause(scope.diretorias);
  return { sql: ` AND c.id_setor_diretoria IN ${c.sql}`, params: c.params as any[] };
}

function buildObraOnlyFilter(f: CentroExecutivoFiltrosDTO) {
  if (!f.idObra) return { sql: '', params: [] as any[] };
  return { sql: ' AND o.id_obra = ?', params: [f.idObra] as any[] };
}

function buildSolicFilter(scope: { empresaTotal: boolean; diretorias: number[] }, f: CentroExecutivoFiltrosDTO) {
  const parts: string[] = [];
  const params: any[] = [];
  if (f.idObra) {
    parts.push('s.id_obra_origem = ?');
    params.push(f.idObra);
  }
  if (f.idUnidade) {
    parts.push('s.id_unidade_origem = ?');
    params.push(f.idUnidade);
  }
  if (f.idDiretoria) {
    parts.push('(c.id_setor_diretoria = ? OR u.id_setor_diretoria = ?)');
    params.push(f.idDiretoria, f.idDiretoria);
  } else if (!scope.empresaTotal && scope.diretorias.length) {
    const d = inClause(scope.diretorias);
    parts.push(`(c.id_setor_diretoria IN ${d.sql} OR u.id_setor_diretoria IN ${d.sql})`);
    params.push(...d.params, ...d.params);
  }
  if (!parts.length) return { sql: '', params: [] as any[] };
  return { sql: ` AND (${parts.join(' AND ')})`, params };
}

function buildNcAcLocalFilter(scope: { empresaTotal: boolean; diretorias: number[] }, f: CentroExecutivoFiltrosDTO, obraField: string, unidadeField: string) {
  const parts: string[] = [];
  const params: any[] = [];
  if (f.idObra) {
    parts.push(`${obraField} = ?`);
    params.push(f.idObra);
  }
  if (f.idUnidade) {
    parts.push(`${unidadeField} = ?`);
    params.push(f.idUnidade);
  }
  if (f.idDiretoria) {
    parts.push('(c.id_setor_diretoria = ? OR u.id_setor_diretoria = ?)');
    params.push(f.idDiretoria, f.idDiretoria);
  } else if (!scope.empresaTotal && scope.diretorias.length) {
    const d = inClause(scope.diretorias);
    parts.push(`(c.id_setor_diretoria IN ${d.sql} OR u.id_setor_diretoria IN ${d.sql})`);
    params.push(...d.params, ...d.params);
  }
  if (!parts.length) return { sql: '', params: [] as any[] };
  return { sql: ` AND (${parts.join(' AND ')})`, params };
}

export async function obterResumoCentroExecutivo(ctx: Ctx, filtros: CentroExecutivoFiltrosDTO): Promise<CentroExecutivoResumoDTO> {
  const scope = await getDashboardScope({ tenantId: ctx.tenantId, id: ctx.userId });
  assertWithinScope(scope, filtros);

  const dir = buildDiretoriaFilter(scope, filtros);
  const obraOnly = buildObraOnlyFilter(filtros);
  const solicitacaoFilter = buildSolicFilter(scope, filtros);
  const localNc = buildNcAcLocalFilter(scope, filtros, 'nc.id_obra', 'nc.id_unidade');
  const localAc = buildNcAcLocalFilter(scope, filtros, 'a.id_obra', 'a.id_unidade');
  const localTr = buildNcAcLocalFilter(scope, filtros, 't.id_obra', 't.id_unidade');

  const [contratosAtivos, obrasAtivas, obrasParalisadas, medicoesPendentes, solicitacoesUrgentes, funcionariosAtivos, horasExtrasPendentes, ncsCriticas, acidentesMes, treinamentosVencidos, itensEstoqueCritico, fin] =
    await Promise.all([
      safeTotal(
        `SELECT COUNT(*) AS total
         FROM contratos c
         WHERE c.tenant_id = ?
           AND c.status_contrato IN ('ATIVO', 'PARALISADO')
           ${dir.sql}`,
        [ctx.tenantId, ...dir.params]
      ),
      safeTotal(
        `SELECT COUNT(*) AS total
         FROM obras o
         INNER JOIN contratos c ON c.id_contrato = o.id_contrato
         WHERE c.tenant_id = ?
           AND o.status_obra = 'ATIVA'
           ${dir.sql}
           ${obraOnly.sql}`,
        [ctx.tenantId, ...dir.params, ...obraOnly.params]
      ),
      safeTotal(
        `SELECT COUNT(*) AS total
         FROM obras o
         INNER JOIN contratos c ON c.id_contrato = o.id_contrato
         WHERE c.tenant_id = ?
           AND o.status_obra = 'PARALISADA'
           ${dir.sql}
           ${obraOnly.sql}`,
        [ctx.tenantId, ...dir.params, ...obraOnly.params]
      ),
      safeTotal(
        `SELECT COUNT(*) AS total
         FROM contratos_medicoes m
         INNER JOIN contratos c ON c.id_contrato = m.id_contrato
         WHERE c.tenant_id = ?
           AND m.status_medicao IN ('EM_ELABORACAO', 'ENVIADA')
           ${dir.sql}`,
        [ctx.tenantId, ...dir.params]
      ),
      safeTotal(
        `SELECT COUNT(*) AS total
         FROM solicitacao_material s
         LEFT JOIN obras o ON o.id_obra = s.id_obra_origem
         LEFT JOIN contratos c ON c.id_contrato = o.id_contrato
         LEFT JOIN unidades u ON u.id_unidade = s.id_unidade_origem
         WHERE s.tenant_id = ?
           AND s.regime_urgencia IN ('URGENTE', 'EMERGENCIAL')
           AND s.status_solicitacao NOT IN ('RECEBIDA', 'CANCELADA')
           ${solicitacaoFilter.sql}`,
        [ctx.tenantId, ...solicitacaoFilter.params]
      ),
      safeTotal(
        `SELECT COUNT(DISTINCT f.id_funcionario) AS total
         FROM funcionarios f
         INNER JOIN funcionarios_lotacoes fl ON fl.id_funcionario = f.id_funcionario AND fl.atual = 1
         LEFT JOIN obras o ON o.id_obra = fl.id_obra
         LEFT JOIN contratos c ON c.id_contrato = o.id_contrato
         LEFT JOIN unidades u ON u.id_unidade = fl.id_unidade
         WHERE f.tenant_id = ?
           AND f.ativo = 1
           AND f.status_funcional = 'ATIVO'
           ${filtros.idObra ? `AND fl.tipo_lotacao = 'OBRA' AND fl.id_obra = ?` : ''}
           ${filtros.idUnidade ? `AND fl.tipo_lotacao = 'UNIDADE' AND fl.id_unidade = ?` : ''}
           ${filtros.idDiretoria ? `AND (c.id_setor_diretoria = ? OR u.id_setor_diretoria = ?)` : dir.sql}`,
        filtros.idObra
          ? [ctx.tenantId, filtros.idObra]
          : filtros.idUnidade
            ? [ctx.tenantId, filtros.idUnidade]
            : filtros.idDiretoria
              ? [ctx.tenantId, filtros.idDiretoria, filtros.idDiretoria]
              : [ctx.tenantId, ...dir.params]
      ),
      safeTotal(
        `SELECT COUNT(*) AS total
         FROM funcionarios_horas_extras he
         INNER JOIN funcionarios f ON f.id_funcionario = he.id_funcionario
         WHERE he.tenant_id = ?
           AND he.status_he IN ('SOLICITADA','AUTORIZADA')
           AND f.ativo = 1`,
        [ctx.tenantId]
      ),
      safeTotal(
        `SELECT COUNT(*) AS total
         FROM sst_nao_conformidades nc
         LEFT JOIN contratos c ON c.id_contrato = (
           SELECT o.id_contrato FROM obras o WHERE o.id_obra = nc.id_obra LIMIT 1
         )
         LEFT JOIN unidades u ON u.id_unidade = nc.id_unidade
         WHERE nc.tenant_id = ?
           AND nc.status_nc IN ('ABERTA','EM_TRATAMENTO','AGUARDANDO_VALIDACAO')
           AND nc.severidade IN ('ALTA','CRITICA')
           ${localNc.sql}`,
        [ctx.tenantId, ...localNc.params]
      ),
      safeTotal(
        `SELECT COUNT(*) AS total
         FROM sst_acidentes a
         LEFT JOIN contratos c ON c.id_contrato = (
           SELECT o.id_contrato FROM obras o WHERE o.id_obra = a.id_obra LIMIT 1
         )
         LEFT JOIN unidades u ON u.id_unidade = a.id_unidade
         WHERE a.tenant_id = ?
           AND DATE_FORMAT(a.data_hora_ocorrencia, '%Y-%m') = DATE_FORMAT(CURDATE(), '%Y-%m')
           ${localAc.sql}`,
        [ctx.tenantId, ...localAc.params]
      ),
      safeTotal(
        `SELECT COUNT(*) AS total
         FROM sst_treinamentos_participantes p
         INNER JOIN sst_treinamentos_turmas t ON t.id_treinamento_turma = p.id_treinamento_turma
         LEFT JOIN unidades u ON u.id_unidade = t.id_unidade
         LEFT JOIN contratos c ON c.id_contrato = (
           SELECT o.id_contrato FROM obras o WHERE o.id_obra = t.id_obra LIMIT 1
         )
         WHERE t.tenant_id = ?
           AND p.validade_ate IS NOT NULL
           AND p.validade_ate < CURDATE()
           ${localTr.sql}`,
        [ctx.tenantId, ...localTr.params]
      ),
      safeTotal(`SELECT COUNT(*) AS total FROM estoque_saldos WHERE tenant_id = ? AND saldo_atual < estoque_minimo`, [ctx.tenantId]),
      safeFinanceiro(
        `SELECT
            COALESCE(SUM(c.valor_atualizado),0) AS valorContratado,
            COALESCE(SUM(c.valor_executado),0) AS valorExecutado,
            COALESCE(SUM(c.valor_pago),0) AS valorPago
         FROM contratos c
         WHERE c.tenant_id = ?
           AND c.status_contrato NOT IN ('RESCINDIDO','CANCELADO')
           ${dir.sql}`,
        [ctx.tenantId, ...dir.params]
      ),
    ]);

  const valorContratado = Number(fin.valorContratado || 0);
  const valorPago = Number(fin.valorPago || 0);

  return {
    contratosAtivos,
    obrasAtivas,
    obrasParalisadas,
    medicoesPendentes,
    solicitacoesUrgentes,
    funcionariosAtivos,
    horasExtrasPendentes,
    ncsCriticas,
    acidentesMes,
    treinamentosVencidos,
    itensEstoqueCritico,
    valorContratado,
    valorExecutado: Number(fin.valorExecutado || 0),
    valorPago,
    saldoFinanceiro: valorContratado - valorPago,
  };
}

export async function obterAlertasCentroExecutivo(ctx: Ctx, filtros: CentroExecutivoFiltrosDTO): Promise<CentroExecutivoAlertaDTO[]> {
  const scope = await getDashboardScope({ tenantId: ctx.tenantId, id: ctx.userId });
  assertWithinScope(scope, filtros);
  const dir = buildDiretoriaFilter(scope, filtros);
  const obraOnly = buildObraOnlyFilter(filtros);
  const solicitacaoFilter = buildSolicFilter(scope, filtros);
  const localNc = buildNcAcLocalFilter(scope, filtros, 'nc.id_obra', 'nc.id_unidade');
  const localAc = buildNcAcLocalFilter(scope, filtros, 'a.id_obra', 'a.id_unidade');
  const localTr = buildNcAcLocalFilter(scope, filtros, 't.id_obra', 't.id_unidade');

  const [contratos, medicoes, solicitacoes, ncs, acidentes, trein] = await Promise.all([
    safeRows(
      `
      SELECT
        'CONTRATO_VENCENDO' AS tipo,
        CONCAT('Contrato vencendo: ', c.numero_contrato) AS titulo,
        CONCAT('Fim previsto em ', DATE_FORMAT(c.data_fim_previsto, '%d/%m/%Y')) AS subtitulo,
        'ALTA' AS criticidade,
        c.id_contrato AS referenciaId,
        '/dashboard/contratos' AS rota,
        'ENGENHARIA' AS modulo
      FROM contratos c
      WHERE c.tenant_id = ?
        AND c.data_fim_previsto IS NOT NULL
        AND c.data_fim_previsto BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 30 DAY)
        ${dir.sql}
      ORDER BY c.data_fim_previsto ASC
      LIMIT 8
      `,
      [ctx.tenantId, ...dir.params]
    ),
    safeRows(
      `
      SELECT
        'MEDICAO_ATRASADA' AS tipo,
        CONCAT('Medição atrasada do contrato ', c.numero_contrato) AS titulo,
        CONCAT('Prevista ', DATE_FORMAT(m.data_prevista_envio, '%d/%m/%Y'), ' / status ', m.status_medicao) AS subtitulo,
        'ALTA' AS criticidade,
        m.id_medicao AS referenciaId,
        '/dashboard/execucao/medicoes' AS rota,
        'ENGENHARIA' AS modulo
      FROM contratos_medicoes m
      INNER JOIN contratos c ON c.id_contrato = m.id_contrato
      INNER JOIN obras o ON o.id_contrato = c.id_contrato
      WHERE c.tenant_id = ?
        AND m.status_medicao IN ('EM_ELABORACAO','ENVIADA')
        AND m.data_prevista_envio IS NOT NULL
        AND m.data_prevista_envio < CURDATE()
        ${dir.sql}
        ${obraOnly.sql}
      ORDER BY m.data_prevista_envio ASC
      LIMIT 8
      `,
      [ctx.tenantId, ...dir.params, ...obraOnly.params]
    ),
    safeRows(
      `
      SELECT
        'SOLICITACAO_URGENTE' AS tipo,
        CONCAT('Solicitação urgente #', s.id_solicitacao_material) AS titulo,
        CONCAT('Status ', s.status_solicitacao, ' / ', s.regime_urgencia) AS subtitulo,
        CASE WHEN s.regime_urgencia = 'EMERGENCIAL' THEN 'CRITICA' ELSE 'ALTA' END AS criticidade,
        s.id_solicitacao_material AS referenciaId,
        '/dashboard/suprimentos/solicitacoes' AS rota,
        'SUPRIMENTOS' AS modulo
      FROM solicitacao_material s
      LEFT JOIN obras o ON o.id_obra = s.id_obra_origem
      LEFT JOIN contratos c ON c.id_contrato = o.id_contrato
      LEFT JOIN unidades u ON u.id_unidade = s.id_unidade_origem
      WHERE s.tenant_id = ?
        AND s.regime_urgencia IN ('URGENTE','EMERGENCIAL')
        AND s.status_solicitacao NOT IN ('RECEBIDA','CANCELADA')
        ${solicitacaoFilter.sql}
      ORDER BY s.created_at DESC
      LIMIT 8
      `,
      [ctx.tenantId, ...solicitacaoFilter.params]
    ),
    safeRows(
      `
      SELECT
        'NC_CRITICA' AS tipo,
        CONCAT('NC crítica #', nc.id_nc) AS titulo,
        CONCAT('Status ', nc.status_nc) AS subtitulo,
        'CRITICA' AS criticidade,
        nc.id_nc AS referenciaId,
        '/dashboard/sst/nao-conformidades' AS rota,
        'SST' AS modulo
      FROM sst_nao_conformidades nc
      LEFT JOIN contratos c ON c.id_contrato = (
        SELECT o.id_contrato FROM obras o WHERE o.id_obra = nc.id_obra LIMIT 1
      )
      LEFT JOIN unidades u ON u.id_unidade = nc.id_unidade
      WHERE nc.tenant_id = ?
        AND nc.status_nc IN ('ABERTA','EM_TRATAMENTO','AGUARDANDO_VALIDACAO')
        AND nc.severidade IN ('ALTA','CRITICA')
        ${localNc.sql}
      ORDER BY nc.id_nc DESC
      LIMIT 8
      `,
      [ctx.tenantId, ...localNc.params]
    ),
    safeRows(
      `
      SELECT
        'ACIDENTE' AS tipo,
        CONCAT('Acidente #', a.id_acidente) AS titulo,
        CONCAT('Status ', a.status_acidente, ' / ', DATE_FORMAT(a.data_hora_ocorrencia, '%d/%m/%Y %H:%i')) AS subtitulo,
        'ALTA' AS criticidade,
        a.id_acidente AS referenciaId,
        '/dashboard/sst/acidentes' AS rota,
        'SST' AS modulo
      FROM sst_acidentes a
      LEFT JOIN contratos c ON c.id_contrato = (
        SELECT o.id_contrato FROM obras o WHERE o.id_obra = a.id_obra LIMIT 1
      )
      LEFT JOIN unidades u ON u.id_unidade = a.id_unidade
      WHERE a.tenant_id = ?
        AND a.data_hora_ocorrencia >= DATE_SUB(NOW(), INTERVAL 30 DAY)
        ${localAc.sql}
      ORDER BY a.data_hora_ocorrencia DESC
      LIMIT 8
      `,
      [ctx.tenantId, ...localAc.params]
    ),
    safeRows(
      `
      SELECT
        'TREINAMENTO_VENCIDO' AS tipo,
        CONCAT('Treinamento vencido: ', COALESCE(t.nome_treinamento, 'Turma')) AS titulo,
        CONCAT('Validade até ', DATE_FORMAT(p.validade_ate, '%d/%m/%Y')) AS subtitulo,
        'MEDIA' AS criticidade,
        t.id_treinamento_turma AS referenciaId,
        '/dashboard/sst/treinamentos' AS rota,
        'SST' AS modulo
      FROM sst_treinamentos_participantes p
      INNER JOIN sst_treinamentos_turmas t ON t.id_treinamento_turma = p.id_treinamento_turma
      LEFT JOIN unidades u ON u.id_unidade = t.id_unidade
      LEFT JOIN contratos c ON c.id_contrato = (
        SELECT o.id_contrato FROM obras o WHERE o.id_obra = t.id_obra LIMIT 1
      )
      WHERE t.tenant_id = ?
        AND p.validade_ate IS NOT NULL
        AND p.validade_ate < CURDATE()
        ${localTr.sql}
      ORDER BY p.validade_ate ASC
      LIMIT 8
      `,
      [ctx.tenantId, ...localTr.params]
    ),
  ]);

  const merged = [...contratos, ...medicoes, ...solicitacoes, ...ncs, ...acidentes, ...trein] as any[];
  return merged.map((r) => ({
    tipo: String(r.tipo) as any,
    titulo: String(r.titulo),
    subtitulo: String(r.subtitulo),
    criticidade: String(r.criticidade) as any,
    referenciaId: r.referenciaId ? Number(r.referenciaId) : null,
    rota: r.rota ? String(r.rota) : null,
    modulo: String(r.modulo) as any,
  }));
}

export async function obterSeriesCentroExecutivo(ctx: Ctx, filtros: CentroExecutivoFiltrosDTO): Promise<CentroExecutivoSerieDTO[]> {
  const scope = await getDashboardScope({ tenantId: ctx.tenantId, id: ctx.userId });
  assertWithinScope(scope, filtros);

  const range = buildDateRange(filtros);
  const dir = buildDiretoriaFilter(scope, filtros);
  const obraOnly = buildObraOnlyFilter(filtros);

  const [rows]: any = await db.query(
    `
    SELECT
      DATE_FORMAT(m.data_prevista_envio, '%Y-%m') AS ref,
      COALESCE(SUM(c.valor_executado), 0) AS valorExecutado,
      COUNT(DISTINCT m.id_medicao) AS medicoes
    FROM contratos_medicoes m
    INNER JOIN contratos c ON c.id_contrato = m.id_contrato
    INNER JOIN obras o ON o.id_contrato = c.id_contrato
    WHERE c.tenant_id = ?
      AND m.data_prevista_envio IS NOT NULL
      AND DATE(m.data_prevista_envio) BETWEEN ? AND ?
      ${dir.sql}
      ${obraOnly.sql}
    GROUP BY DATE_FORMAT(m.data_prevista_envio, '%Y-%m')
    ORDER BY ref ASC
    `,
    [ctx.tenantId, range.dataInicial, range.dataFinal, ...dir.params, ...obraOnly.params]
  );

  const base = (rows as any[]).map((r) => ({
    referencia: String(r.ref),
    valorExecutado: Number(r.valorExecutado || 0),
    medicoes: Number(r.medicoes || 0),
    ncsCriticas: 0,
    acidentes: 0,
    solicitacoesUrgentes: 0,
  }));

  return base.slice(-6);
}

export async function obterComparativoCentroExecutivo(ctx: Ctx, filtros: CentroExecutivoFiltrosDTO): Promise<CentroExecutivoComparativoDTO[]> {
  const scope = await getDashboardScope({ tenantId: ctx.tenantId, id: ctx.userId });
  assertWithinScope(scope, filtros);

  const recorte = filtros.recorte || 'DIRETORIA';

  if (recorte === 'OBRA') {
    const dir = buildDiretoriaFilter(scope, filtros);
    const obraOnly = buildObraOnlyFilter(filtros);
    const rows = await safeRows(
      `
      SELECT
        o.id_obra AS idObra,
        CONCAT('Obra #', o.id_obra) AS nomeObra,
        s.nome_setor AS diretoriaNome,
        COALESCE(med.total, 0) AS medicoesPendentes,
        COALESCE(sol.total, 0) AS solicitacoesUrgentes,
        COALESCE(nc.total, 0) AS ncsCriticas,
        COALESCE(ac.total, 0) AS acidentes90d
      FROM obras o
      INNER JOIN contratos c ON c.id_contrato = o.id_contrato
      LEFT JOIN organizacao_setores s ON s.id_setor = c.id_setor_diretoria
      LEFT JOIN (
        SELECT o2.id_obra, COUNT(DISTINCT m.id_medicao) AS total
        FROM contratos_medicoes m
        INNER JOIN contratos c2 ON c2.id_contrato = m.id_contrato
        INNER JOIN obras o2 ON o2.id_contrato = c2.id_contrato
        WHERE c2.tenant_id = ? AND m.status_medicao IN ('EM_ELABORACAO', 'ENVIADA')
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
      WHERE c.tenant_id = ?
        ${dir.sql}
        ${obraOnly.sql}
      ORDER BY (COALESCE(med.total,0)*2 + COALESCE(sol.total,0)*2 + COALESCE(nc.total,0)*5 + COALESCE(ac.total,0)*8) DESC
      LIMIT 30
      `,
      [ctx.tenantId, ctx.tenantId, ctx.tenantId, ctx.tenantId, ctx.tenantId, ...dir.params, ...obraOnly.params]
    );

    return rows.map((r: any) => {
      const medicoesPendentes = Number(r.medicoesPendentes || 0);
      const solicitacoesUrgentes = Number(r.solicitacoesUrgentes || 0);
      const ncsCriticas = Number(r.ncsCriticas || 0);
      const acidentes90d = Number(r.acidentes90d || 0);
      const scoreSaude = scoreSaudeExecutiva({ medicoesPendentes, solicitacoesUrgentes, ncsCriticas, acidentes90d, treinamentosVencidos: 0, estoqueCritico: 0 });
      return {
        recorte: 'OBRA',
        referenciaId: Number(r.idObra),
        nome: String(r.nomeObra),
        contratosAtivos: 0,
        obrasAtivas: 0,
        medicoesPendentes,
        solicitacoesUrgentes,
        funcionariosAtivos: 0,
        ncsCriticas,
        acidentes90d,
        estoqueCritico: 0,
        valorExecutado: 0,
        scoreSaude,
      };
    });
  }

  if (recorte === 'UNIDADE') {
    const ids = scope.empresaTotal ? null : scope.unidades;
    const filtro = filtros.idUnidade ? { sql: ' AND u.id_unidade = ?', params: [filtros.idUnidade] } : ids && ids.length ? (() => { const c = inClause(ids); return { sql: ` AND u.id_unidade IN ${c.sql}`, params: c.params }; })() : { sql: '', params: [] as any[] };
    const rows = await safeRows(
      `
      SELECT
        u.id_unidade AS idUnidade,
        u.nome AS nome,
        COALESCE(sol.total, 0) AS solicitacoesUrgentes,
        COALESCE(nc.total, 0) AS ncsCriticas,
        COALESCE(ac.total, 0) AS acidentes90d,
        COALESCE(fun.total, 0) AS funcionariosAtivos
      FROM unidades u
      LEFT JOIN (
        SELECT s.id_unidade_origem AS id_unidade, COUNT(*) AS total
        FROM solicitacao_material s
        WHERE s.tenant_id = ?
          AND s.id_unidade_origem IS NOT NULL
          AND s.regime_urgencia IN ('URGENTE','EMERGENCIAL')
          AND s.status_solicitacao NOT IN ('RECEBIDA','CANCELADA')
        GROUP BY s.id_unidade_origem
      ) sol ON sol.id_unidade = u.id_unidade
      LEFT JOIN (
        SELECT nc.id_unidade AS id_unidade, COUNT(*) AS total
        FROM sst_nao_conformidades nc
        WHERE nc.tenant_id = ?
          AND nc.id_unidade IS NOT NULL
          AND nc.status_nc IN ('ABERTA','EM_TRATAMENTO','AGUARDANDO_VALIDACAO')
          AND nc.severidade IN ('ALTA','CRITICA')
        GROUP BY nc.id_unidade
      ) nc ON nc.id_unidade = u.id_unidade
      LEFT JOIN (
        SELECT a.id_unidade AS id_unidade, COUNT(*) AS total
        FROM sst_acidentes a
        WHERE a.tenant_id = ?
          AND a.id_unidade IS NOT NULL
          AND a.data_hora_ocorrencia >= DATE_SUB(CURDATE(), INTERVAL 90 DAY)
        GROUP BY a.id_unidade
      ) ac ON ac.id_unidade = u.id_unidade
      LEFT JOIN (
        SELECT fl.id_unidade AS id_unidade, COUNT(DISTINCT f.id_funcionario) AS total
        FROM funcionarios f
        INNER JOIN funcionarios_lotacoes fl ON fl.id_funcionario = f.id_funcionario AND fl.atual = 1
        WHERE f.tenant_id = ?
          AND f.ativo = 1
          AND f.status_funcional = 'ATIVO'
          AND fl.tipo_lotacao = 'UNIDADE'
          AND fl.id_unidade IS NOT NULL
        GROUP BY fl.id_unidade
      ) fun ON fun.id_unidade = u.id_unidade
      WHERE u.tenant_id = ? AND u.ativo = 1
        ${filtro.sql}
      ORDER BY (COALESCE(sol.total,0)*2 + COALESCE(nc.total,0)*5 + COALESCE(ac.total,0)*8) DESC
      LIMIT 30
      `,
      [ctx.tenantId, ctx.tenantId, ctx.tenantId, ctx.tenantId, ctx.tenantId, ...filtro.params]
    );

    return rows.map((r: any) => {
      const solicitacoesUrgentes = Number(r.solicitacoesUrgentes || 0);
      const ncsCriticas = Number(r.ncsCriticas || 0);
      const acidentes90d = Number(r.acidentes90d || 0);
      const funcionariosAtivos = Number(r.funcionariosAtivos || 0);
      const scoreSaude = scoreSaudeExecutiva({ medicoesPendentes: 0, solicitacoesUrgentes, ncsCriticas, acidentes90d, treinamentosVencidos: 0, estoqueCritico: 0 });
      return {
        recorte: 'UNIDADE',
        referenciaId: Number(r.idUnidade),
        nome: String(r.nome),
        contratosAtivos: 0,
        obrasAtivas: 0,
        medicoesPendentes: 0,
        solicitacoesUrgentes,
        funcionariosAtivos,
        ncsCriticas,
        acidentes90d,
        estoqueCritico: 0,
        valorExecutado: 0,
        scoreSaude,
      };
    });
  }

  const dirIds = filtros.idDiretoria ? [filtros.idDiretoria] : scope.empresaTotal ? null : scope.diretorias;
  const dirFilter = dirIds && dirIds.length ? inClause(dirIds) : null;
  const diretorias = await safeRows(
    `
    SELECT id_setor AS id, nome_setor AS nome
    FROM organizacao_setores
    WHERE tenant_id = ?
      ${dirFilter ? `AND id_setor IN ${dirFilter.sql}` : ''}
      AND ativo = 1
    ORDER BY nome_setor
    LIMIT 30
    `,
    dirFilter ? [ctx.tenantId, ...dirFilter.params] : [ctx.tenantId]
  );

  const out: CentroExecutivoComparativoDTO[] = [];
  for (const d of diretorias as any[]) {
    const idDiretoria = Number(d.id);
    const f = { ...filtros, idDiretoria };
    const resumo = await obterResumoCentroExecutivo(ctx, f);
    const acidentes90d = await safeTotal(
      `
      SELECT COUNT(*) AS total
      FROM sst_acidentes a
      LEFT JOIN contratos c ON c.id_contrato = (
        SELECT o.id_contrato FROM obras o WHERE o.id_obra = a.id_obra LIMIT 1
      )
      LEFT JOIN unidades u ON u.id_unidade = a.id_unidade
      WHERE a.tenant_id = ?
        AND a.data_hora_ocorrencia >= DATE_SUB(CURDATE(), INTERVAL 90 DAY)
        AND (c.id_setor_diretoria = ? OR u.id_setor_diretoria = ?)
      `,
      [ctx.tenantId, idDiretoria, idDiretoria]
    );
    const scoreSaude = scoreSaudeExecutiva({
      medicoesPendentes: resumo.medicoesPendentes,
      solicitacoesUrgentes: resumo.solicitacoesUrgentes,
      ncsCriticas: resumo.ncsCriticas,
      acidentes90d,
      treinamentosVencidos: resumo.treinamentosVencidos,
      estoqueCritico: resumo.itensEstoqueCritico,
    });
    out.push({
      recorte: 'DIRETORIA',
      referenciaId: idDiretoria,
      nome: String(d.nome),
      contratosAtivos: resumo.contratosAtivos,
      obrasAtivas: resumo.obrasAtivas,
      medicoesPendentes: resumo.medicoesPendentes,
      solicitacoesUrgentes: resumo.solicitacoesUrgentes,
      funcionariosAtivos: resumo.funcionariosAtivos,
      ncsCriticas: resumo.ncsCriticas,
      acidentes90d,
      estoqueCritico: resumo.itensEstoqueCritico,
      valorExecutado: resumo.valorExecutado,
      scoreSaude,
    });
  }

  out.sort((a, b) => a.scoreSaude - b.scoreSaude);
  return out;
}

export async function obterMatrizCentroExecutivo(ctx: Ctx, filtros: CentroExecutivoFiltrosDTO): Promise<CentroExecutivoMatrizLinhaDTO[]> {
  const comparativo = await obterComparativoCentroExecutivo(ctx, { ...filtros, recorte: filtros.recorte || 'DIRETORIA' });
  return comparativo.map((c) => {
    const rhScore = scoreDimensao({ pendencias: 0, criticidade: 0 });
    const sstScore = scoreDimensao({ pendencias: c.acidentes90d, criticidade: c.ncsCriticas });
    const suprimentosScore = scoreDimensao({ pendencias: c.solicitacoesUrgentes, criticidade: c.estoqueCritico });
    const engenhariaScore = scoreDimensao({ pendencias: c.medicoesPendentes, criticidade: 0 });
    const financeiroScore = scoreDimensao({ pendencias: 0, criticidade: 0 });
    const sg = scoreGlobal({ rhScore, sstScore, suprimentosScore, engenhariaScore, financeiroScore });
    return {
      recorte: c.recorte,
      referenciaId: c.referenciaId,
      nome: c.nome,
      rhScore,
      sstScore,
      suprimentosScore,
      engenhariaScore,
      financeiroScore,
      scoreGlobal: sg,
    };
  });
}

export async function obterRankingObrasCentroExecutivo(ctx: Ctx, filtros: CentroExecutivoFiltrosDTO): Promise<CentroExecutivoRankingObraDTO[]> {
  const scope = await getDashboardScope({ tenantId: ctx.tenantId, id: ctx.userId });
  assertWithinScope(scope, filtros);
  const dir = buildDiretoriaFilter(scope, filtros);
  const obraOnly = buildObraOnlyFilter(filtros);

  const rows = await safeRows(
    `
    SELECT
      o.id_obra AS idObra,
      CONCAT('Obra #', o.id_obra) AS nomeObra,
      s.nome_setor AS diretoriaNome,
      COALESCE(med.total, 0) AS medicoesPendentes,
      COALESCE(sol.total, 0) AS solicitacoesUrgentes,
      COALESCE(nc.total, 0) AS ncsCriticas,
      COALESCE(ac.total, 0) AS acidentes90d,
      COALESCE(tr.total, 0) AS treinamentosVencidos
    FROM obras o
    INNER JOIN contratos c ON c.id_contrato = o.id_contrato
    LEFT JOIN organizacao_setores s ON s.id_setor = c.id_setor_diretoria
    LEFT JOIN (
      SELECT o2.id_obra, COUNT(DISTINCT m.id_medicao) AS total
      FROM contratos_medicoes m
      INNER JOIN contratos c2 ON c2.id_contrato = m.id_contrato
      INNER JOIN obras o2 ON o2.id_contrato = c2.id_contrato
      WHERE c2.tenant_id = ? AND m.status_medicao IN ('EM_ELABORACAO', 'ENVIADA')
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
      SELECT t.id_obra, COUNT(*) AS total
      FROM sst_treinamentos_participantes p
      INNER JOIN sst_treinamentos_turmas t ON t.id_treinamento_turma = p.id_treinamento_turma
      WHERE t.tenant_id = ?
        AND t.id_obra IS NOT NULL
        AND p.validade_ate IS NOT NULL
        AND p.validade_ate < CURDATE()
      GROUP BY t.id_obra
    ) tr ON tr.id_obra = o.id_obra
    WHERE c.tenant_id = ?
      ${dir.sql}
      ${obraOnly.sql}
    ORDER BY (COALESCE(med.total,0)*2 + COALESCE(sol.total,0)*2 + COALESCE(nc.total,0)*5 + COALESCE(ac.total,0)*8 + COALESCE(tr.total,0)*2) DESC, o.id_obra DESC
    LIMIT 20
    `,
    [ctx.tenantId, ctx.tenantId, ctx.tenantId, ctx.tenantId, ctx.tenantId, ctx.tenantId, ...dir.params, ...obraOnly.params]
  );

  return rows.map((r: any) => {
    const medicoesPendentes = Number(r.medicoesPendentes || 0);
    const solicitacoesUrgentes = Number(r.solicitacoesUrgentes || 0);
    const ncsCriticas = Number(r.ncsCriticas || 0);
    const acidentes90d = Number(r.acidentes90d || 0);
    const treinamentosVencidos = Number(r.treinamentosVencidos || 0);
    const estoqueCritico = 0;
    const scoreRisco = scoreRiscoObra({ medicoesPendentes, solicitacoesUrgentes, ncsCriticas, acidentes90d, treinamentosVencidos, estoqueCritico });
    return {
      idObra: Number(r.idObra),
      nomeObra: String(r.nomeObra),
      diretoriaNome: r.diretoriaNome ? String(r.diretoriaNome) : null,
      medicoesPendentes,
      solicitacoesUrgentes,
      ncsCriticas,
      acidentes90d,
      treinamentosVencidos,
      estoqueCritico,
      scoreRisco,
    };
  });
}

export function parseCentroExecutivoFiltrosFromRequest(req: Request) {
  return parseFiltros(new URL(req.url));
}

