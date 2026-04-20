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
      const cap = Number(capacidade[recurso] || 0);
      if (cap > 0 && usado > cap) {
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
  desempenhoCc: Array<{ cc: string | null; servico: string; planejadoQtd: number; executadoQtd: number; execucaoPct: number | null; produtividade: number | null; pessoas: number; planejadoHoras: number; executadoHoras: number }>;
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

  const desempenhoCc = Array.from(byCcServico.values())
    .map((c) => {
      const execPct = c.planejadoQtd > 0 ? c.executadoQtd / c.planejadoQtd : null;
      const prod = c.executadoHoras > 0 ? c.executadoQtd / c.executadoHoras : null;
      return {
        cc: c.cc,
        servico: c.servico,
        firstDate: c.firstDate,
        planejadoQtd: Number(c.planejadoQtd || 0),
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

function buildGanttData(desempenhoCc: BuildDataResult['desempenhoCc'], semanaInicio: string, todayIso: string) {
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
      ccs.push({
        id,
        cc: d.cc || 'SEM_CC',
        servico,
        inicio: inicioBase,
        fim: inicioBase + dur,
        latencia: 0,
        dependencias: i > 0 ? [`${servico}|${sorted[i - 1].cc || 'SEM_CC'}`] : [],
        progresso: clamp(d.execucaoPct || 0, 0, 1),
        pessoas: d.pessoas || 0,
        recursos: {
          mo: [{ tipo: 'MO_TOTAL', qtd: Math.max(1, d.pessoas || 1) }],
          eq: [{ tipo: 'EQ_GERAL', qtd: Math.max(1, Math.round((d.planejadoHoras || 0) / 16) || 1) }],
          ins: [{ tipo: 'INS_GERAL', qtd: Math.max(1, Math.round(d.planejadoQtd || 1) || 1) }],
        },
      });
    }
  }

  const capacidade = {
    MO_TOTAL: Math.max(1, Math.ceil(ccs.reduce((s, c) => s + c.recursos.mo[0].qtd, 0) * 0.45)),
    EQ_GERAL: Math.max(1, Math.ceil(ccs.reduce((s, c) => s + c.recursos.eq[0].qtd, 0) * 0.4)),
    INS_GERAL: Math.max(1, Math.ceil(ccs.reduce((s, c) => s + c.recursos.ins[0].qtd, 0) * 0.7)),
  };

  const recalc = marcarCaminhoCritico(recalcularDependencias(ccs));
  const conflitos = detectarConflitosComCapacidade(recalc, capacidade);
  const conflitoSet = new Set<string>();
  conflitos.forEach((c) => c.ccs.forEach((id) => conflitoSet.add(id)));
  const out = recalc.map((c) => ({ ...c, conflito: conflitoSet.has(c.id) }));

  return { hoje: Number(dayToday.toFixed(2)), ccs: out, capacidade, conflitos };
}

export async function GET(req: NextRequest) {
  try {
    const current = await requireApiPermission(PERMISSIONS.DASHBOARD_ENGENHARIA_VIEW);
    const idObra = Number(req.nextUrl.searchParams.get('idObra') || 0);
    const semanaInicio = normalizeDate(req.nextUrl.searchParams.get('semanaInicio'));
    if (!Number.isFinite(idObra) || idObra <= 0) return fail(422, 'idObra é obrigatório');
    if (!canAccessObra(current as any, idObra)) return fail(403, 'Sem acesso à obra');
    if (!semanaInicio) return fail(422, 'semanaInicio é obrigatório (YYYY-MM-DD)');

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

    const gantt = buildGanttData(desempenhoCc as any, semanaInicio, todayIso);
    if (gantt.conflitos.length) {
      alertas.push({ prioridade: 'ALTA', tipo: 'CONFLITO_RECURSO', mensagem: `${gantt.conflitos.length} conflito(s) de recurso detectado(s) no cronograma.` });
    }

    const visaoHoje = grid.filter((g) => g.data === todayIso).sort((a, b) => String(a.cc || '').localeCompare(String(b.cc || ''), 'pt-BR'));

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
        maoObra: { necessario: desempenhoCc.reduce((s, c) => s + (c.pessoas || 0), 0), alocado: null, deficit: null },
        equipamentos: { necessario: null, disponivel: null, deficit: null },
        insumos: { necessario: null, disponivel: null, deficit: null },
      },
      desempenhoCc,
      alertas,
      solicitacoes: [],
      visaoDiaria: { data: todayIso, itens: visaoHoje },
      gantt,
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
    const ganttBase = buildGanttData(base.desempenhoCc as any, semanaInicio, base.todayIso);
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
