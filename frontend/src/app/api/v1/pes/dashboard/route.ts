import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { ok, fail, handleApiError } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { canAccessObra } from '@/lib/auth/access';

export const runtime = 'nodejs';

function normalizeDate(v: unknown) {
  const s = String(v ?? '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

function addDays(dateIso: string, days: number) {
  const d = new Date(`${dateIso}T00:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function minutesBetween(dateIso: string, horaInicio: string | null, horaFim: string | null) {
  if (!horaInicio || !horaFim) return 0;
  const a = new Date(`${dateIso}T${horaInicio.length === 5 ? `${horaInicio}:00` : horaInicio}`);
  const b = new Date(`${dateIso}T${horaFim.length === 5 ? `${horaFim}:00` : horaFim}`);
  const diff = Math.round((b.getTime() - a.getTime()) / 60000);
  return diff > 0 ? diff : 0;
}

type CcNode = {
  id: string;
  cc: string;
  servico: string;
  planejadoQtd?: number;
  totalServicoQtd?: number;
  pctParteServico?: number | null;
  contratoServicoQtd?: number;
  pctParteContrato?: number | null;
  inicio: number;
  fim: number;
  latencia: number;
  dependencias: string[];
  progresso: number;
  pessoas: number;
  recursos: { mo: Array<{ tipo: string; qtd: number }>; eq: Array<{ tipo: string; qtd: number }>; ins: Array<{ tipo: string; qtd: number }> };
  critico?: boolean;
  conflito?: boolean;
};

type Conflito = { tempo: number; recurso: string; usado: number; capacidade: number; ccs: string[] };

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function duracao(cc: CcNode) {
  return Math.max(0.25, Number((cc.fim - cc.inicio).toFixed(4)));
}

function ordenarTopologicamente(ccs: CcNode[]) {
  const map = new Map<string, CcNode>();
  ccs.forEach((c) => map.set(c.id, c));
  const vis = new Set<string>();
  const pilha = new Set<string>();
  const out: string[] = [];

  function dfs(id: string) {
    if (vis.has(id)) return;
    if (pilha.has(id)) return;
    pilha.add(id);
    const cc = map.get(id);
    if (cc) {
      for (const dep of cc.dependencias || []) {
        if (map.has(dep)) dfs(dep);
      }
    }
    pilha.delete(id);
    vis.add(id);
    out.push(id);
  }

  ccs.forEach((c) => dfs(c.id));
  return out;
}

function calcularInicio(cc: CcNode, map: Map<string, CcNode>) {
  if (!cc.dependencias?.length) return cc.inicio || 0;
  let m = 0;
  for (const depId of cc.dependencias) {
    const dep = map.get(depId);
    if (!dep) continue;
    m = Math.max(m, dep.fim + (cc.latencia || 0));
  }
  return m;
}

function recalcularDependencias(ccs: CcNode[], ccAlteradoId?: string) {
  const map = new Map<string, CcNode>();
  ccs.forEach((c) => map.set(c.id, { ...c, dependencias: [...(c.dependencias || [])] }));
  const ordem = ordenarTopologicamente(ccs);
  for (const id of ordem) {
    const cc = map.get(id);
    if (!cc) continue;
    const d = duracao(cc);
    const inicioCalc = calcularInicio(cc, map);
    if (id === ccAlteradoId) {
      cc.inicio = Math.max(cc.inicio, inicioCalc);
      cc.fim = cc.inicio + d;
    } else {
      cc.inicio = inicioCalc;
      cc.fim = cc.inicio + d;
    }
  }
  return Array.from(map.values());
}

function detectarConflitosComCapacidade(ccs: CcNode[], capacidade: Record<string, number>) {
  const timeline = new Map<number, Record<string, { usado: number; ccs: Set<string> }>>();
  for (const cc of ccs) {
    const tIni = Math.floor(cc.inicio);
    const tFim = Math.ceil(cc.fim);
    for (let t = tIni; t < tFim; t += 1) {
      if (!timeline.has(t)) timeline.set(t, {});
      const slot = timeline.get(t)!;
      const recursos = [...cc.recursos.mo, ...cc.recursos.eq, ...cc.recursos.ins];
      for (const r of recursos) {
        if (!slot[r.tipo]) slot[r.tipo] = { usado: 0, ccs: new Set<string>() };
        slot[r.tipo].usado += Number(r.qtd || 0);
        slot[r.tipo].ccs.add(cc.id);
      }
    }
  }
  const conflitos: Conflito[] = [];
  for (const [tempo, slot] of timeline.entries()) {
    for (const recurso of Object.keys(slot)) {
      const usado = slot[recurso].usado;
      if (!Object.prototype.hasOwnProperty.call(capacidade, recurso)) continue;
      const cap = Number(capacidade[recurso]);
      if (!Number.isFinite(cap)) continue;
      if (usado > cap) {
        conflitos.push({ tempo, recurso, usado, capacidade: cap, ccs: Array.from(slot[recurso].ccs) });
      }
    }
  }
  return conflitos.sort((a, b) => (a.tempo === b.tempo ? a.recurso.localeCompare(b.recurso, 'pt-BR') : a.tempo - b.tempo));
}

function marcarCaminhoCritico(ccs: CcNode[]) {
  if (!ccs.length) return ccs;
  const map = new Map<string, CcNode>();
  ccs.forEach((c) => map.set(c.id, { ...c, critico: false }));
  let last = Array.from(map.values())[0];
  for (const c of map.values()) {
    if (c.fim > last.fim) last = c;
  }
  const crit = new Set<string>();
  let curr: CcNode | undefined = last;
  while (curr) {
    crit.add(curr.id);
    if (!curr.dependencias?.length) break;
    let next: CcNode | undefined;
    for (const depId of curr.dependencias) {
      const dep = map.get(depId);
      if (!dep) continue;
      if (!next || dep.fim > next.fim) next = dep;
    }
    curr = next;
  }
  for (const c of map.values()) c.critico = crit.has(c.id);
  return Array.from(map.values());
}

function escolherMenorPrioridade(ids: string[], map: Map<string, CcNode>) {
  const arr = ids.map((id) => map.get(id)).filter(Boolean) as CcNode[];
  if (!arr.length) return null;
  arr.sort((a, b) => {
    if (!!a.critico !== !!b.critico) return a.critico ? 1 : -1;
    const da = duracao(a);
    const db = duracao(b);
    if (da !== db) return da - db;
    return (b.inicio || 0) - (a.inicio || 0);
  });
  return arr[0];
}

function autoReplanejar(ccsOrig: CcNode[], capacidade: Record<string, number>, maxIter = 100) {
  let ccs = marcarCaminhoCritico(recalcularDependencias(ccsOrig));
  let conflitos = detectarConflitosComCapacidade(ccs, capacidade);
  let iter = 0;
  while (conflitos.length && iter < maxIter) {
    iter += 1;
    const map = new Map<string, CcNode>();
    ccs.forEach((c) => map.set(c.id, { ...c }));
    let moved = 0;
    for (const conf of conflitos) {
      const candidato = escolherMenorPrioridade(conf.ccs, map);
      if (!candidato) continue;
      candidato.inicio += 1;
      candidato.fim += 1;
      moved += 1;
    }
    if (!moved) break;
    ccs = marcarCaminhoCritico(recalcularDependencias(Array.from(map.values())));
    conflitos = detectarConflitosComCapacidade(ccs, capacidade);
  }
  const conflitoSet = new Set<string>();
  conflitos.forEach((c) => c.ccs.forEach((id) => conflitoSet.add(id)));
  ccs = ccs.map((c) => ({ ...c, conflito: conflitoSet.has(c.id) }));
  return { ccs, conflitos, iteracoes: iter };
}

async function ensureAtivosTables() {
  await db.query(
    `
    CREATE TABLE IF NOT EXISTS engenharia_ativos (
      id_ativo BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      tenant_id BIGINT UNSIGNED NOT NULL,
      categoria ENUM('EQUIPAMENTO','FERRAMENTA','VEICULO') NOT NULL DEFAULT 'EQUIPAMENTO',
      descricao VARCHAR(255) NOT NULL,
      codigo_interno VARCHAR(80) NULL,
      patrimonio VARCHAR(80) NULL,
      proprietario ENUM('PROPRIO','TERCEIRO') NOT NULL DEFAULT 'PROPRIO',
      status ENUM('ATIVO','MANUTENCAO','DESCARTADO','INATIVO') NOT NULL DEFAULT 'ATIVO',
      local_tipo ENUM('OBRA','UNIDADE','ALMOXARIFADO','TERCEIRO') NULL,
      local_id BIGINT UNSIGNED NULL,
      id_contraparte BIGINT UNSIGNED NULL,
      id_contrato_locacao BIGINT UNSIGNED NULL,
      criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id_ativo),
      KEY idx_tenant (tenant_id),
      KEY idx_local (tenant_id, local_tipo, local_id),
      KEY idx_status (tenant_id, status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `
  );
}

function normalizeTextUpper(s: string) {
  return s
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function classificarTipoEquipamento(descricao: string) {
  const t = normalizeTextUpper(descricao || '');
  if (!t) return 'OUTROS';
  if (t.includes('RETRO')) return 'RETROESCAVADEIRA';
  if (t.includes('ESCAVADEIRA')) return 'ESCAVADEIRA';
  if (t.includes('PA CARREGADEIRA') || t.includes('PA-CARREGADEIRA')) return 'PA_CARREGADEIRA';
  if (t.includes('CAMINHAO') || t.includes('TRUCK')) return 'CAMINHAO';
  if (t.includes('BETONEIRA')) return 'BETONEIRA';
  if (t.includes('GUINDASTE')) return 'GUINDASTE';
  if (t.includes('GRUA')) return 'GRUA';
  if (t.includes('ROLO') || t.includes('COMPACTADOR')) return 'COMPACTADOR';
  if (t.includes('GERADOR')) return 'GERADOR';
  if (t.includes('BOMBA')) return 'BOMBA';
  return 'OUTROS';
}

function toEquipResourceKey(tipoClassificado: string) {
  const key = normalizeTextUpper(tipoClassificado || 'OUTROS').replace(/\s+/g, '_');
  return `EQ_${key || 'OUTROS'}`;
}

async function ensureProgramacaoEquipTables() {
  await db.query(
    `
    CREATE TABLE IF NOT EXISTS engenharia_programacoes_semanais_equipamentos (
      id_programacao_equip BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      tenant_id BIGINT UNSIGNED NOT NULL,
      id_obra BIGINT UNSIGNED NOT NULL,
      semana_inicio DATE NOT NULL,
      semana_fim DATE NOT NULL,
      status ENUM('RASCUNHO','FECHADA') NOT NULL DEFAULT 'RASCUNHO',
      id_usuario_criador BIGINT UNSIGNED NOT NULL,
      criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id_programacao_equip),
      UNIQUE KEY uk_obra_semana (tenant_id, id_obra, semana_inicio),
      KEY idx_tenant (tenant_id),
      KEY idx_obra (tenant_id, id_obra),
      KEY idx_status (tenant_id, status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `
  );

  await db.query(
    `
    CREATE TABLE IF NOT EXISTS engenharia_programacoes_semanais_equipamentos_itens (
      id_item BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      tenant_id BIGINT UNSIGNED NOT NULL,
      id_programacao_equip BIGINT UNSIGNED NOT NULL,
      data_referencia DATE NOT NULL,
      id_ativo BIGINT UNSIGNED NOT NULL,
      codigo_servico VARCHAR(80) NOT NULL,
      horas_previstas DECIMAL(10,2) NULL,
      frente_trabalho VARCHAR(120) NULL,
      observacao TEXT NULL,
      criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id_item),
      UNIQUE KEY uk_item (tenant_id, id_programacao_equip, data_referencia, id_ativo, codigo_servico),
      KEY idx_prog (tenant_id, id_programacao_equip),
      KEY idx_data (tenant_id, data_referencia)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `
  );
}

async function loadDemandaEquipPorServico(tenantId: number, idObra: number, semanaInicio: string) {
  try {
    await ensureProgramacaoEquipTables();
    await ensureAtivosTables();

    const [[prog]]: any = await db.query(
      `
      SELECT id_programacao_equip AS id
      FROM engenharia_programacoes_semanais_equipamentos
      WHERE tenant_id = ? AND id_obra = ? AND semana_inicio = ?
      LIMIT 1
      `,
      [tenantId, idObra, semanaInicio]
    );

    const idProg = Number(prog?.id || 0);
    if (!idProg) return new Map<string, Array<{ tipo: string; qtd: number }>>();

    const [rows]: any = await db.query(
      `
      SELECT
        i.data_referencia AS dataReferencia,
        i.codigo_servico AS codigoServico,
        i.id_ativo AS idAtivo,
        a.descricao AS ativoDescricao
      FROM engenharia_programacoes_semanais_equipamentos_itens i
      LEFT JOIN engenharia_ativos a
        ON a.tenant_id = i.tenant_id AND a.id_ativo = i.id_ativo
      WHERE i.tenant_id = ? AND i.id_programacao_equip = ?
      `,
      [tenantId, idProg]
    );

    const slots = new Map<string, Set<number>>();
    for (const r of rows as any[]) {
      const servico = String(r.codigoServico || '').trim();
      const data = String(r.dataReferencia || '').slice(0, 10);
      const idAtivo = Number(r.idAtivo || 0);
      const desc = String(r.ativoDescricao || '');
      if (!servico || !data || !idAtivo) continue;
      const tipo = toEquipResourceKey(classificarTipoEquipamento(desc));
      const slotKey = `${servico}|${data}|${tipo}`;
      if (!slots.has(slotKey)) slots.set(slotKey, new Set<number>());
      slots.get(slotKey)!.add(idAtivo);
    }

    const maxByServicoTipo = new Map<string, number>();
    for (const [slotKey, setIds] of slots.entries()) {
      const [servico, , tipo] = slotKey.split('|');
      const k = `${servico}|${tipo}`;
      const prev = maxByServicoTipo.get(k) ?? 0;
      if (setIds.size > prev) maxByServicoTipo.set(k, setIds.size);
    }

    const out = new Map<string, Array<{ tipo: string; qtd: number }>>();
    for (const [k, qtd] of maxByServicoTipo.entries()) {
      const [servico, tipo] = k.split('|');
      if (!out.has(servico)) out.set(servico, []);
      out.get(servico)!.push({ tipo, qtd });
    }
    for (const [servico, arr] of out.entries()) {
      arr.sort((a, b) => a.tipo.localeCompare(b.tipo, 'pt-BR'));
      out.set(servico, arr);
    }
    return out;
  } catch {
    return new Map<string, Array<{ tipo: string; qtd: number }>>();
  }
}

async function ensurePesInsumosExtrasTables() {
  await db.query(
    `
    CREATE TABLE IF NOT EXISTS engenharia_pes_insumos_extras (
      id_extra BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      tenant_id BIGINT UNSIGNED NOT NULL,
      id_obra BIGINT UNSIGNED NOT NULL,
      semana_inicio DATE NOT NULL,
      codigo_servico VARCHAR(80) NOT NULL,
      codigo_centro_custo VARCHAR(40) NULL,
      codigo_insumo VARCHAR(80) NULL,
      item_descricao VARCHAR(200) NOT NULL,
      unidade_medida VARCHAR(32) NULL,
      delta_quantidade DECIMAL(14,4) NOT NULL DEFAULT 0,
      observacao TEXT NULL,
      id_usuario BIGINT UNSIGNED NULL,
      criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id_extra),
      KEY idx_obra_semana (tenant_id, id_obra, semana_inicio),
      KEY idx_serv_cc (tenant_id, codigo_servico, codigo_centro_custo),
      KEY idx_criado (tenant_id, criado_em)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `
  );
  await db.query(`ALTER TABLE engenharia_pes_insumos_extras ADD COLUMN codigo_insumo VARCHAR(80) NULL AFTER codigo_centro_custo`).catch(() => null);
}

function toInsumoExtraResourceKey(codigoInsumo: string | null, itemDescricao: string) {
  const code = codigoInsumo ? normalizeTextUpper(codigoInsumo).replace(/\s+/g, '_').slice(0, 32) : '';
  if (code) return `INS_EXTRA_${code}`;
  const key = normalizeTextUpper(itemDescricao || '').replace(/\s+/g, '_').slice(0, 32);
  return `INS_EXTRA_${key || 'ITEM'}`;
}

async function loadInsumosExtrasPorCc(tenantId: number, idObra: number, semanaInicio: string) {
  try {
    await ensurePesInsumosExtrasTables();
    const [rows]: any = await db.query(
      `
      SELECT
        codigo_servico AS codigoServico,
        codigo_centro_custo AS codigoCentroCusto,
        codigo_insumo AS codigoInsumo,
        item_descricao AS itemDescricao,
        delta_quantidade AS deltaQuantidade
      FROM engenharia_pes_insumos_extras
      WHERE tenant_id = ?
        AND id_obra = ?
        AND semana_inicio = ?
      `,
      [tenantId, idObra, semanaInicio]
    );

    const out = new Map<string, Array<{ tipo: string; qtd: number }>>();
    const agg = new Map<string, number>();
    for (const r of rows as any[]) {
      const servico = String(r.codigoServico || '').trim().toUpperCase();
      const cc = r.codigoCentroCusto ? String(r.codigoCentroCusto).trim().toUpperCase() : 'SEM_CC';
      const codigoInsumo = r.codigoInsumo ? String(r.codigoInsumo).trim().toUpperCase() : null;
      const item = String(r.itemDescricao || '').trim();
      const delta = Number(r.deltaQuantidade || 0);
      if (!servico || !item || !Number.isFinite(delta) || delta === 0) continue;
      const tipo = toInsumoExtraResourceKey(codigoInsumo, item);
      const k = `${servico}|${cc}|${tipo}`;
      agg.set(k, Number((agg.get(k) || 0) + delta));
    }

    for (const [k, qtd] of agg.entries()) {
      if (!Number.isFinite(qtd) || qtd === 0) continue;
      const [servico, cc, tipo] = k.split('|');
      const key = `${servico}|${cc}`;
      if (!out.has(key)) out.set(key, []);
      out.get(key)!.push({ tipo, qtd });
    }

    for (const [k, arr] of out.entries()) {
      arr.sort((a, b) => a.tipo.localeCompare(b.tipo, 'pt-BR'));
      out.set(k, arr);
    }

    return out;
  } catch {
    return new Map<string, Array<{ tipo: string; qtd: number }>>();
  }
}

async function loadCapacidadeReal(tenantId: number, idObra: number) {
  let mo: number | null = null;
  let eqTotal: number | null = null;
  let eqPorTipo: Record<string, number> | null = null;

  try {
    const [[row]]: any = await db.query(
      `
      SELECT COUNT(DISTINCT f.id_funcionario) AS total
      FROM funcionarios f
      INNER JOIN funcionarios_lotacoes fl ON fl.id_funcionario = f.id_funcionario AND fl.atual = 1
      WHERE f.tenant_id = ?
        AND f.ativo = 1
        AND f.status_funcional = 'ATIVO'
        AND fl.tipo_lotacao = 'OBRA'
        AND fl.id_obra = ?
      `,
      [tenantId, idObra]
    );
    mo = Number(row?.total ?? 0);
    if (!Number.isFinite(mo)) mo = 0;
  } catch {
    mo = null;
  }

  try {
    await ensureAtivosTables();
    const [rows]: any = await db.query(
      `
      SELECT a.id_ativo AS idAtivo, a.descricao AS descricao
      FROM engenharia_ativos a
      WHERE a.tenant_id = ?
        AND a.status = 'ATIVO'
        AND a.categoria IN ('EQUIPAMENTO','VEICULO')
        AND a.local_tipo = 'OBRA'
        AND a.local_id = ?
      `,
      [tenantId, idObra]
    );
    const map: Record<string, number> = {};
    let total = 0;
    for (const r of rows as any[]) {
      const desc = String(r.descricao || '');
      const tipo = toEquipResourceKey(classificarTipoEquipamento(desc));
      map[tipo] = Number(map[tipo] || 0) + 1;
      total += 1;
    }
    eqPorTipo = map;
    eqTotal = Number(total || 0);
  } catch {
    eqTotal = null;
    eqPorTipo = null;
  }

  return { mo, eqTotal, eqPorTipo };
}

type BuildDataResult = {
  semanaFim: string;
  todayIso: string;
  grid: Array<{
    data: string;
    cc: string | null;
    servico: string;
    pessoas: number;
    planejadoQtd: number;
    executadoQtd: number;
    execucaoPct: number | null;
    status: 'OK' | 'ATRASADO' | 'RISCO';
  }>;
  desempenhoCc: Array<{
    cc: string | null;
    servico: string;
    firstDate: string;
    planejadoQtd: number;
    totalServicoQtd: number;
    pctParteServico: number | null;
    contratoServicoQtd: number;
    pctParteContrato: number | null;
    executadoQtd: number;
    execucaoPct: number | null;
    produtividade: number | null;
    pessoas: number;
    planejadoHoras: number;
    executadoHoras: number;
  }>;
  totalPlan: number;
  totalExec: number;
  totalPlanHoras: number;
  totalExecHoras: number;
};

async function loadBaseData(tenantId: number, idObra: number, semanaInicio: string): Promise<BuildDataResult> {
  const semanaFim = addDays(semanaInicio, 6);
  const [planRows]: any = await db.query(
    `
    SELECT
      i.data_referencia AS dataReferencia,
      i.codigo_servico AS codigoServico,
      i.codigo_centro_custo AS codigoCentroCusto,
      i.id_funcionario AS idFuncionario,
      i.hora_inicio_prevista AS horaInicioPrevista,
      i.hora_fim_prevista AS horaFimPrevista,
      i.he_prevista_minutos AS hePrevistaMinutos,
      i.producao_prevista AS producaoPrevista
    FROM engenharia_programacoes_semanais p
    INNER JOIN engenharia_programacoes_semanais_itens i
      ON i.tenant_id = p.tenant_id AND i.id_programacao = p.id_programacao
    WHERE p.tenant_id = ?
      AND p.id_obra = ?
      AND p.semana_inicio = ?
    `,
    [tenantId, idObra, semanaInicio]
  );

  const [execRows]: any = await db.query(
    `
    SELECT
      data_referencia AS dataReferencia,
      codigo_servico AS codigoServico,
      codigo_centro_custo AS codigoCentroCusto,
      SUM(quantidade) AS quantidade,
      SUM(horas) AS horas
    FROM engenharia_apropriacoes
    WHERE tenant_id = ?
      AND id_obra = ?
      AND data_referencia >= ?
      AND data_referencia <= ?
    GROUP BY data_referencia, codigo_servico, codigo_centro_custo
    `,
    [tenantId, idObra, semanaInicio, semanaFim]
  );

  const execMap = new Map<string, { quantidade: number; horas: number }>();
  for (const r of execRows as any[]) {
    const key = `${String(r.dataReferencia)}|${String(r.codigoServico)}|${r.codigoCentroCusto ? String(r.codigoCentroCusto) : ''}`;
    execMap.set(key, { quantidade: Number(r.quantidade || 0), horas: Number(r.horas || 0) });
  }

  const grid: BuildDataResult['grid'] = [];
  const todayIso = new Date().toISOString().slice(0, 10);
  const group = new Map<string, any>();
  for (const r of planRows as any[]) {
    const data = String(r.dataReferencia);
    const servico = String(r.codigoServico || '').trim().toUpperCase();
    const cc = r.codigoCentroCusto ? String(r.codigoCentroCusto).trim().toUpperCase() : '';
    const idFuncionario = Number(r.idFuncionario || 0);
    if (!data || !servico) continue;
    const key = `${data}|${servico}|${cc}`;
    const g = group.get(key) || { data, servico, cc: cc || null, pessoasSet: new Set<number>(), planejadoQtd: 0, planejadoHoras: 0 };
    if (idFuncionario) g.pessoasSet.add(idFuncionario);
    g.planejadoQtd += r.producaoPrevista == null ? 0 : Number(r.producaoPrevista || 0);
    const min = minutesBetween(data, r.horaInicioPrevista ? String(r.horaInicioPrevista).slice(0, 5) : null, r.horaFimPrevista ? String(r.horaFimPrevista).slice(0, 5) : null);
    g.planejadoHoras += (min + Number(r.hePrevistaMinutos || 0)) / 60;
    group.set(key, g);
  }

  let totalPlan = 0;
  let totalExec = 0;
  let totalPlanHoras = 0;
  let totalExecHoras = 0;
  const byCcServico = new Map<string, { cc: string | null; servico: string; planejadoQtd: number; executadoQtd: number; planejadoHoras: number; executadoHoras: number; pessoasSet: Set<number>; firstDate: string }>();

  for (const [key, g] of group.entries()) {
    const [data, servico, ccRaw] = key.split('|');
    const exec = execMap.get(key) || { quantidade: 0, horas: 0 };
    const planejadoQtd = Number(g.planejadoQtd || 0);
    const executadoQtd = Number(exec.quantidade || 0);
    const execucaoPct = planejadoQtd > 0 ? executadoQtd / planejadoQtd : null;
    const status: 'OK' | 'ATRASADO' | 'RISCO' = planejadoQtd <= 0 ? 'RISCO' : execucaoPct != null && execucaoPct >= 1 ? 'OK' : data <= todayIso ? 'ATRASADO' : 'RISCO';
    grid.push({ data, cc: ccRaw || null, servico, pessoas: g.pessoasSet.size, planejadoQtd, executadoQtd, execucaoPct: execucaoPct == null ? null : Number(execucaoPct.toFixed(4)), status });
    totalPlan += planejadoQtd;
    totalExec += executadoQtd;
    totalPlanHoras += Number(g.planejadoHoras || 0);
    totalExecHoras += Number(exec.horas || 0);
    const ccKey = ccRaw || '(SEM_CC)';
    const k = `${servico}|${ccKey}`;
    const agg = byCcServico.get(k) || {
      cc: ccRaw || null,
      servico,
      planejadoQtd: 0,
      executadoQtd: 0,
      planejadoHoras: 0,
      executadoHoras: 0,
      pessoasSet: new Set<number>(),
      firstDate: data,
    };
    agg.planejadoQtd += planejadoQtd;
    agg.executadoQtd += executadoQtd;
    agg.planejadoHoras += Number(g.planejadoHoras || 0);
    agg.executadoHoras += Number(exec.horas || 0);
    g.pessoasSet.forEach((id: number) => agg.pessoasSet.add(id));
    if (data < agg.firstDate) agg.firstDate = data;
    byCcServico.set(k, agg);
  }

  const totalByServico = new Map<string, number>();
  for (const c of byCcServico.values()) {
    totalByServico.set(c.servico, Number((totalByServico.get(c.servico) || 0) + Number(c.planejadoQtd || 0)));
  }

  await db
    .query(
      `
      CREATE TABLE IF NOT EXISTS obras_planilhas_itens (
        id_item BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        tenant_id BIGINT UNSIGNED NOT NULL,
        id_obra BIGINT UNSIGNED NOT NULL,
        codigo_servico VARCHAR(80) NOT NULL,
        descricao_servico VARCHAR(220) NULL,
        unidade_medida VARCHAR(32) NULL,
        quantidade_contratada DECIMAL(14,4) NULL,
        preco_unitario DECIMAL(14,6) NULL,
        valor_total DECIMAL(14,6) NULL,
        criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        id_usuario_criador BIGINT UNSIGNED NOT NULL,
        PRIMARY KEY (id_item),
        UNIQUE KEY uk_item (tenant_id, id_obra, codigo_servico),
        KEY idx_tenant (tenant_id),
        KEY idx_obra (tenant_id, id_obra)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `
    )
    .catch(() => null);

  const servicosDistinct = Array.from(new Set(Array.from(byCcServico.values()).map((c) => c.servico))).filter(Boolean);
  const contratoByServico = new Map<string, number>();
  if (servicosDistinct.length) {
    const placeholders = servicosDistinct.map(() => '?').join(',');
    const [rows]: any = await db.query(
      `
      SELECT codigo_servico AS codigoServico, quantidade_contratada AS quantidadeContratada
      FROM obras_planilhas_itens
      WHERE tenant_id = ? AND id_obra = ? AND codigo_servico IN (${placeholders})
      `,
      [tenantId, idObra, ...servicosDistinct]
    );
    for (const r of rows as any[]) {
      const codigo = String(r.codigoServico || '').trim().toUpperCase();
      const qtd = Number(r.quantidadeContratada || 0);
      if (!codigo) continue;
      if (!Number.isFinite(qtd)) continue;
      contratoByServico.set(codigo, qtd);
    }
  }

  const desempenhoCc = Array.from(byCcServico.values())
    .map((c) => {
      const totalServicoQtd = Number(totalByServico.get(c.servico) || 0);
      const contratoServicoQtd = Number(contratoByServico.get(c.servico) || 0);
      const execPct = c.planejadoQtd > 0 ? c.executadoQtd / c.planejadoQtd : null;
      const prod = c.executadoHoras > 0 ? c.executadoQtd / c.executadoHoras : null;
      const pctParteServico = totalServicoQtd > 0 ? Number((Number(c.planejadoQtd || 0) / totalServicoQtd).toFixed(6)) : null;
      const pctParteContrato = contratoServicoQtd > 0 ? Number((Number(c.planejadoQtd || 0) / contratoServicoQtd).toFixed(6)) : null;
      return {
        cc: c.cc,
        servico: c.servico,
        firstDate: c.firstDate,
        planejadoQtd: Number(c.planejadoQtd || 0),
        totalServicoQtd,
        pctParteServico,
        contratoServicoQtd,
        pctParteContrato,
        executadoQtd: Number(c.executadoQtd || 0),
        execucaoPct: execPct == null ? null : Number(execPct.toFixed(4)),
        produtividade: prod == null ? null : Number(prod.toFixed(4)),
        pessoas: c.pessoasSet.size,
        planejadoHoras: Number(c.planejadoHoras || 0),
        executadoHoras: Number(c.executadoHoras || 0),
      };
    })
    .sort((a, b) => (a.firstDate === b.firstDate ? String(a.cc || '').localeCompare(String(b.cc || ''), 'pt-BR') : a.firstDate.localeCompare(b.firstDate)));

  return { semanaFim, todayIso, grid, desempenhoCc, totalPlan, totalExec, totalPlanHoras, totalExecHoras };
}

function buildGanttData(
  desempenhoCc: BuildDataResult['desempenhoCc'],
  semanaInicio: string,
  todayIso: string,
  capacidadeReal?: { mo: number | null; eqTotal: number | null; eqPorTipo: Record<string, number> | null },
  demandaEquipPorServico?: Map<string, Array<{ tipo: string; qtd: number }>>,
  insumosExtrasPorCc?: Map<string, Array<{ tipo: string; qtd: number }>>
) {
  const day0 = new Date(`${semanaInicio}T00:00:00`).getTime();
  const dayToday = Math.max(0, (new Date(`${todayIso}T00:00:00`).getTime() - day0) / (24 * 3600 * 1000));
  const byServico = new Map<string, typeof desempenhoCc>();
  desempenhoCc.forEach((d) => {
    const arr = byServico.get(d.servico) || [];
    arr.push(d);
    byServico.set(d.servico, arr);
  });

  const ccs: CcNode[] = [];
  for (const [servico, arr] of byServico.entries()) {
    const sorted = [...arr].sort((a, b) => (a.firstDate === b.firstDate ? String(a.cc || '').localeCompare(String(b.cc || ''), 'pt-BR') : a.firstDate.localeCompare(b.firstDate)));
    for (let i = 0; i < sorted.length; i += 1) {
      const d = sorted[i];
      const inicioBase = Math.max(0, (new Date(`${d.firstDate}T00:00:00`).getTime() - day0) / (24 * 3600 * 1000));
      const dur = Math.max(0.5, Number((d.planejadoHoras / 8 || 0.5).toFixed(2)));
      const id = `${servico}|${d.cc || 'SEM_CC'}`;
      const eqPorTipoDemanda = (demandaEquipPorServico?.get(servico) || []).filter((x) => x && x.qtd > 0);
      const eqRecursos =
        eqPorTipoDemanda.length > 0
          ? eqPorTipoDemanda
          : [{ tipo: 'EQ_OUTROS', qtd: Math.max(1, Math.round((d.planejadoHoras || 0) / 16) || 1) }];

      const ccCodigo = String(d.cc || 'SEM_CC').trim().toUpperCase();
      const extrasInsumos = insumosExtrasPorCc?.get(`${servico}|${ccCodigo}`) || [];
      const insBase = [{ tipo: 'INS_GERAL', qtd: Math.max(1, Math.round(d.planejadoQtd || 1) || 1) }, ...extrasInsumos];
      const insAgg = new Map<string, number>();
      for (const it of insBase) {
        if (!it?.tipo) continue;
        const q = Number(it.qtd || 0);
        if (!Number.isFinite(q) || q === 0) continue;
        insAgg.set(it.tipo, Number((insAgg.get(it.tipo) || 0) + q));
      }
      const ins = Array.from(insAgg.entries())
        .map(([tipo, qtd]) => ({ tipo, qtd: Math.max(0, Number(qtd.toFixed(4))) }))
        .filter((x) => x.qtd > 0)
        .sort((a, b) => a.tipo.localeCompare(b.tipo, 'pt-BR'));
      ccs.push({
        id,
        cc: d.cc || 'SEM_CC',
        servico,
        planejadoQtd: Number(d.planejadoQtd || 0),
        totalServicoQtd: Number(d.totalServicoQtd || 0),
        pctParteServico: d.pctParteServico == null ? null : Number(d.pctParteServico),
        contratoServicoQtd: Number(d.contratoServicoQtd || 0),
        pctParteContrato: d.pctParteContrato == null ? null : Number(d.pctParteContrato),
        inicio: inicioBase,
        fim: inicioBase + dur,
        latencia: 0,
        dependencias: i > 0 ? [`${servico}|${sorted[i - 1].cc || 'SEM_CC'}`] : [],
        progresso: clamp(d.execucaoPct || 0, 0, 1),
        pessoas: d.pessoas || 0,
        recursos: {
          mo: [{ tipo: 'MO_TOTAL', qtd: Math.max(1, d.pessoas || 1) }],
          eq: eqRecursos,
          ins,
        },
      });
    }
  }

  const moDemand = ccs.reduce((s, c) => s + (c.recursos.mo || []).reduce((ss, r) => ss + Number(r?.qtd || 0), 0), 0);
  const eqDemand = ccs.reduce((s, c) => s + (c.recursos.eq || []).reduce((ss, r) => ss + Number(r?.qtd || 0), 0), 0);
  const insGeralDemand = ccs.reduce(
    (s, c) => s + (c.recursos.ins || []).reduce((ss, r) => (String(r?.tipo || '') === 'INS_GERAL' ? ss + Number(r?.qtd || 0) : ss), 0),
    0
  );

  const capacidade: Record<string, number> = {
    MO_TOTAL: capacidadeReal?.mo == null ? Math.max(1, Math.ceil(moDemand * 0.45)) : Math.max(0, capacidadeReal.mo),
    EQ_GERAL: capacidadeReal?.eqTotal == null ? Math.max(1, Math.ceil(eqDemand * 0.4)) : Math.max(0, capacidadeReal.eqTotal),
    INS_GERAL: Math.max(1, Math.ceil(insGeralDemand * 0.7)),
  };
  if (capacidadeReal?.eqPorTipo) {
    for (const [k, v] of Object.entries(capacidadeReal.eqPorTipo)) {
      capacidade[k] = Math.max(0, Number(v || 0));
    }
  }

  for (const cc of ccs) {
    for (const r of cc.recursos.eq || []) {
      const tipo = String(r?.tipo || '');
      if (!tipo) continue;
      if (!Object.prototype.hasOwnProperty.call(capacidade, tipo)) capacidade[tipo] = 0;
    }
  }

  const recalc = marcarCaminhoCritico(recalcularDependencias(ccs));
  const conflitos = detectarConflitosComCapacidade(recalc, capacidade);
  const conflitoSet = new Set<string>();
  conflitos.forEach((c) => c.ccs.forEach((id) => conflitoSet.add(id)));
  const out = recalc.map((c) => ({ ...c, conflito: conflitoSet.has(c.id) }));

  return { hoje: Number(dayToday.toFixed(2)), ccs: out, capacidade, conflitos };
}

async function loadCustoRealUtilizadoPorCc(tenantId: number, idObra: number, semanaInicio: string) {
  try {
    await db.query(
      `
      CREATE TABLE IF NOT EXISTS engenharia_pes_apropriacoes (
        id_apropriacao BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        tenant_id BIGINT UNSIGNED NOT NULL,
        id_obra BIGINT UNSIGNED NOT NULL,
        semana_inicio DATE NOT NULL,
        id_workflow BIGINT UNSIGNED NULL,
        codigo_centro_custo VARCHAR(40) NULL,
        codigo_servico VARCHAR(80) NULL,
        natureza_custo ENUM('MAO','FERRAMENTA','EQUIPAMENTO','MATERIAL') NOT NULL,
        quantidade DECIMAL(14,4) NOT NULL DEFAULT 0,
        unidade_medida VARCHAR(32) NULL,
        custo_unitario DECIMAL(14,6) NOT NULL DEFAULT 0,
        custo_total DECIMAL(14,4) NOT NULL DEFAULT 0,
        observacao TEXT NULL,
        id_usuario BIGINT UNSIGNED NULL,
        criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id_apropriacao),
        KEY idx_obra_semana (tenant_id, id_obra, semana_inicio),
        KEY idx_cc_servico (tenant_id, codigo_centro_custo, codigo_servico),
        KEY idx_natureza (tenant_id, natureza_custo)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `
    );
  } catch {
    return {
      total: 0,
      porCc: [] as Array<{ cc: string; servico: string; custoReal: number; natureza: 'MAO' | 'FERRAMENTA' | 'EQUIPAMENTO' | 'MATERIAL' }>,
      porNatureza: { MAO: 0, FERRAMENTA: 0, EQUIPAMENTO: 0, MATERIAL: 0 },
    };
  }

  try {
    const [rows]: any = await db.query(
      `
      SELECT
        COALESCE(codigo_centro_custo, 'SEM_CC') AS cc,
        codigo_servico AS servico,
        natureza_custo AS natureza,
        SUM(custo_total) AS custoReal
      FROM engenharia_pes_apropriacoes
      WHERE tenant_id = ?
        AND id_obra = ?
        AND semana_inicio = ?
      GROUP BY COALESCE(codigo_centro_custo, 'SEM_CC'), codigo_servico, natureza_custo
      ORDER BY cc, servico, natureza_custo
      `,
      [tenantId, idObra, semanaInicio]
    );
    const porCc = (rows as any[]).map((r) => ({
      cc: String(r.cc || 'SEM_CC'),
      servico: String(r.servico || ''),
      natureza: String(r.natureza || 'MATERIAL') as 'MAO' | 'FERRAMENTA' | 'EQUIPAMENTO' | 'MATERIAL',
      custoReal: Number(Number(r.custoReal || 0).toFixed(4)),
    }));
    const total = Number(porCc.reduce((s, x) => s + Number(x.custoReal || 0), 0).toFixed(4));
    const porNatureza = { MAO: 0, FERRAMENTA: 0, EQUIPAMENTO: 0, MATERIAL: 0 };
    for (const item of porCc) {
      if (item.natureza === 'MAO') porNatureza.MAO += item.custoReal;
      else if (item.natureza === 'FERRAMENTA') porNatureza.FERRAMENTA += item.custoReal;
      else if (item.natureza === 'EQUIPAMENTO') porNatureza.EQUIPAMENTO += item.custoReal;
      else porNatureza.MATERIAL += item.custoReal;
    }
    porNatureza.MAO = Number(porNatureza.MAO.toFixed(4));
    porNatureza.FERRAMENTA = Number(porNatureza.FERRAMENTA.toFixed(4));
    porNatureza.EQUIPAMENTO = Number(porNatureza.EQUIPAMENTO.toFixed(4));
    porNatureza.MATERIAL = Number(porNatureza.MATERIAL.toFixed(4));
    return { total, porCc, porNatureza };
  } catch {
    return {
      total: 0,
      porCc: [] as Array<{ cc: string; servico: string; custoReal: number; natureza: 'MAO' | 'FERRAMENTA' | 'EQUIPAMENTO' | 'MATERIAL' }>,
      porNatureza: { MAO: 0, FERRAMENTA: 0, EQUIPAMENTO: 0, MATERIAL: 0 },
    };
  }
}

export async function GET(req: NextRequest) {
  try {
    const current = await requireApiPermission(PERMISSIONS.DASHBOARD_ENGENHARIA_VIEW);
    const idObra = Number(req.nextUrl.searchParams.get('idObra') || 0);
    const semanaInicio = normalizeDate(req.nextUrl.searchParams.get('semanaInicio'));
    if (!Number.isFinite(idObra) || idObra <= 0) return fail(422, 'idObra é obrigatório');
    if (!canAccessObra(current as any, idObra)) return fail(403, 'Sem acesso à obra');
    if (!semanaInicio) return fail(422, 'semanaInicio é obrigatório (YYYY-MM-DD)');

    const exportKey = String(req.nextUrl.searchParams.get('export') || '').trim();
    if (exportKey === 'custo-real-csv') {
      const custoRealUtilizado = await loadCustoRealUtilizadoPorCc(current.tenantId, idObra, semanaInicio);
      const header = ['CC', 'SERVICO', 'NATUREZA', 'CUSTO_TOTAL'].join(';');
      const lines = (custoRealUtilizado.porCc || []).map((r: any) => {
        const cc = String(r.cc || '');
        const servico = String(r.servico || '');
        const natureza = String(r.natureza || '');
        const custo = Number(r.custoReal || 0).toFixed(4);
        return [cc, servico, natureza, custo].join(';');
      });
      const resumo = [
        '',
        'RESUMO;;;;',
        `TOTAL; ; ;${Number(custoRealUtilizado.total || 0).toFixed(4)}`,
        `MAO; ; ;${Number(custoRealUtilizado.porNatureza?.MAO || 0).toFixed(4)}`,
        `FERRAMENTA; ; ;${Number(custoRealUtilizado.porNatureza?.FERRAMENTA || 0).toFixed(4)}`,
        `EQUIPAMENTO; ; ;${Number(custoRealUtilizado.porNatureza?.EQUIPAMENTO || 0).toFixed(4)}`,
        `MATERIAL; ; ;${Number(custoRealUtilizado.porNatureza?.MATERIAL || 0).toFixed(4)}`,
      ].join('\n');

      const csv = [header, ...lines].join('\n') + resumo;
      const filename = `custo-real-obra-${idObra}-semana-${semanaInicio}.csv`;
      return new Response(csv, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="${filename}"`,
        },
      });
    }

    const base = await loadBaseData(current.tenantId, idObra, semanaInicio);
    const { semanaFim, todayIso, grid, desempenhoCc, totalPlan, totalExec, totalPlanHoras, totalExecHoras } = base;

    const execucaoFisica = totalPlan > 0 ? totalExec / totalPlan : null;
    const produtividade = totalExecHoras > 0 ? totalExec / totalExecHoras : null;

    const criticalChain = desempenhoCc
      .filter((c) => c.cc)
      .slice(0, 12)
      .map((c) => ({
        cc: c.cc as string,
        status: (c.execucaoPct ?? 0) >= 1 ? 'OK' : (c.execucaoPct ?? 0) >= 0.7 ? 'RISCO' : 'ATRASADO',
      }));

    const alertas: Array<{ prioridade: 'ALTA' | 'MEDIA' | 'BAIXA'; tipo: string; mensagem: string }> = [];
    if (execucaoFisica != null && execucaoFisica < 0.7) alertas.push({ prioridade: 'ALTA', tipo: 'PRAZO', mensagem: 'Execução física abaixo de 70% da semana.' });
    if (produtividade != null && produtividade < 0.6) alertas.push({ prioridade: 'MEDIA', tipo: 'PRODUTIVIDADE', mensagem: 'Produtividade abaixo do esperado (executado/horas).' });
    if (desempenhoCc.some((c) => c.cc == null)) alertas.push({ prioridade: 'MEDIA', tipo: 'DADOS', mensagem: 'Existem itens planejados sem centro de custo.' });

    const [capacidadeReal, demandaEquipPorServico, insumosExtrasPorCc, custoRealUtilizado] = await Promise.all([
      loadCapacidadeReal(current.tenantId, idObra),
      loadDemandaEquipPorServico(current.tenantId, idObra, semanaInicio),
      loadInsumosExtrasPorCc(current.tenantId, idObra, semanaInicio),
      loadCustoRealUtilizadoPorCc(current.tenantId, idObra, semanaInicio),
    ]);
    const gantt = buildGanttData(desempenhoCc as any, semanaInicio, todayIso, capacidadeReal, demandaEquipPorServico, insumosExtrasPorCc);
    if (gantt.conflitos.length) {
      alertas.push({ prioridade: 'ALTA', tipo: 'CONFLITO_RECURSO', mensagem: `${gantt.conflitos.length} conflito(s) de recurso detectado(s) no cronograma.` });
    }

    const visaoHoje = grid.filter((g) => g.data === todayIso).sort((a, b) => String(a.cc || '').localeCompare(String(b.cc || ''), 'pt-BR'));
    const moNec = desempenhoCc.reduce((s, c) => s + (c.pessoas || 0), 0);
    const moDisp = capacidadeReal.mo;
    const moDef = moDisp == null ? null : Math.max(0, moNec - moDisp);
    const eqNec = (gantt.ccs || []).reduce((s: number, c: any) => s + (c?.recursos?.eq || []).reduce((ss: number, r: any) => ss + Number(r?.qtd || 0), 0), 0);
    const eqDisp = capacidadeReal.eqTotal;
    const eqDef = eqDisp == null ? null : Math.max(0, eqNec - eqDisp);

    return ok({
      idObra,
      semanaInicio,
      semanaFim,
      kpis: {
        execucaoFisica: execucaoFisica == null ? null : Number(execucaoFisica.toFixed(4)),
        produtividade: produtividade == null ? null : Number(produtividade.toFixed(4)),
        prazoDias: null,
        custoVariacaoPct: null,
      },
      caminhoCritico: criticalChain,
      programacao: grid.sort((a, b) => (a.data === b.data ? String(a.cc || '').localeCompare(String(b.cc || ''), 'pt-BR') : a.data.localeCompare(b.data))),
      recursos: {
        maoObra: { necessario: moNec, alocado: moDisp, deficit: moDef },
        equipamentos: { necessario: eqNec, disponivel: eqDisp, deficit: eqDef },
        insumos: { necessario: null, disponivel: null, deficit: null },
      },
      desempenhoCc,
      alertas,
      solicitacoes: [],
      visaoDiaria: { data: todayIso, itens: visaoHoje },
      gantt,
      custoReal: custoRealUtilizado,
      debug: { totalPlanejadoQtd: totalPlan, totalExecutadoQtd: totalExec, totalPlanejadoHoras: totalPlanHoras, totalExecutadoHoras: totalExecHoras },
    });
  } catch (e) {
    return handleApiError(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const current = await requireApiPermission(PERMISSIONS.DASHBOARD_ENGENHARIA_VIEW);
    const body = (await req.json().catch(() => null)) as any;
    const idObra = Number(body?.idObra || 0);
    const semanaInicio = normalizeDate(body?.semanaInicio);
    const auto = body?.autoReplanejar !== false;
    const alteracoes = Array.isArray(body?.alteracoes) ? body.alteracoes : [];
    if (!Number.isFinite(idObra) || idObra <= 0) return fail(422, 'idObra é obrigatório');
    if (!canAccessObra(current as any, idObra)) return fail(403, 'Sem acesso à obra');
    if (!semanaInicio) return fail(422, 'semanaInicio é obrigatório (YYYY-MM-DD)');

    const base = await loadBaseData(current.tenantId, idObra, semanaInicio);
    const [capacidadeReal, demandaEquipPorServico, insumosExtrasPorCc] = await Promise.all([
      loadCapacidadeReal(current.tenantId, idObra),
      loadDemandaEquipPorServico(current.tenantId, idObra, semanaInicio),
      loadInsumosExtrasPorCc(current.tenantId, idObra, semanaInicio),
    ]);
    const ganttBase = buildGanttData(base.desempenhoCc as any, semanaInicio, base.todayIso, capacidadeReal, demandaEquipPorServico, insumosExtrasPorCc);
    let ccs: CcNode[] = [...(ganttBase.ccs as any[])];
    const capacidade = { ...(ganttBase.capacidade as Record<string, number>) };

    let ccAlteradoId: string | undefined;
    for (const ch of alteracoes) {
      const id = String(ch?.id || '');
      const inicio = Number(ch?.inicio);
      const fim = Number(ch?.fim);
      if (!id || !Number.isFinite(inicio) || !Number.isFinite(fim) || fim <= inicio) continue;
      ccs = ccs.map((c) => (c.id === id ? { ...c, inicio, fim } : c));
      ccAlteradoId = id;
    }

    ccs = marcarCaminhoCritico(recalcularDependencias(ccs, ccAlteradoId));
    let conflitos = detectarConflitosComCapacidade(ccs, capacidade);
    let iteracoes = 0;
    if (auto) {
      const solved = autoReplanejar(ccs, capacidade, 120);
      ccs = solved.ccs;
      conflitos = solved.conflitos;
      iteracoes = solved.iteracoes;
    }

    return ok({
      semanaInicio,
      semanaFim: base.semanaFim,
      gantt: { hoje: ganttBase.hoje, ccs, capacidade, conflitos },
      autoReplanejado: auto,
      iteracoes,
      conflitosAbertos: conflitos.length,
    });
  } catch (e) {
    return handleApiError(e);
  }
}
