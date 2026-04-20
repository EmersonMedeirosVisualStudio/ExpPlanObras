import { NextRequest } from 'next/server';
import { ok, fail, handleApiError } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { canAccessObra } from '@/lib/auth/access';

export const runtime = 'nodejs';

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
      if (cap > 0 && usado > cap) conflitos.push({ tempo, recurso, usado, capacidade: cap, ccs: Array.from(slot[recurso].ccs) });
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
    return duracao(a) - duracao(b);
  });
  return arr[0];
}

function autoReplanejar(ccsOrig: CcNode[], capacidade: Record<string, number>, maxIter: number) {
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

function calcPrazo(ccs: CcNode[]) {
  return ccs.reduce((m, c) => Math.max(m, c.fim), 0);
}

function calcCusto(ccs: CcNode[]) {
  const rates: Record<string, number> = { MO_TOTAL: 90, EQ_GERAL: 140, INS_GERAL: 18 };
  let total = 0;
  for (const cc of ccs) {
    const horas = (cc.fim - cc.inicio) * 8;
    for (const r of cc.recursos.mo) total += (rates[r.tipo] || 0) * (r.qtd || 0) * horas;
    for (const r of cc.recursos.eq) total += (rates[r.tipo] || 0) * (r.qtd || 0) * horas;
    for (const r of cc.recursos.ins) total += (rates[r.tipo] || 0) * (r.qtd || 0) * horas;
  }
  return Number(total.toFixed(2));
}

function objetivo(ccs: CcNode[], pesoPrazo: number) {
  return Number((calcCusto(ccs) + pesoPrazo * calcPrazo(ccs)).toFixed(2));
}

function rand(seed: number) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

function gerarVizinho(base: CcNode[], r: () => number) {
  const ccs = base.map((c) => ({ ...c, dependencias: [...(c.dependencias || [])], recursos: { mo: [...c.recursos.mo], eq: [...c.recursos.eq], ins: [...c.recursos.ins] } }));
  if (!ccs.length) return ccs;
  const idx = Math.floor(r() * ccs.length);
  const cc = ccs[idx];
  const tipo = r();
  if (tipo < 0.5) {
    const delta = r() > 0.5 ? 1 : -1;
    cc.inicio = Math.max(0, cc.inicio + delta);
    cc.fim = cc.inicio + duracao(cc);
  } else if (tipo < 0.75) {
    const rr = cc.recursos.mo[0];
    if (rr) rr.qtd = Math.max(1, rr.qtd + (r() > 0.5 ? 1 : -1));
  } else {
    const rr = cc.recursos.eq[0];
    if (rr) rr.qtd = Math.max(1, rr.qtd + (r() > 0.5 ? 1 : -1));
  }
  return ccs;
}

export async function POST(req: NextRequest) {
  try {
    const current = await requireApiPermission(PERMISSIONS.DASHBOARD_ENGENHARIA_VIEW);
    const body = (await req.json().catch(() => null)) as any;
    const idObra = Number(body?.idObra || 0);
    const semanaInicio = String(body?.semanaInicio || '').trim();
    const ccs = (Array.isArray(body?.ccs) ? body.ccs : []) as CcNode[];
    const capacidade = (body?.capacidade && typeof body.capacidade === 'object' ? body.capacidade : {}) as Record<string, number>;
    const pesoPrazo = Number(body?.config?.pesoPrazo ?? 1000);
    const iter = Math.min(800, Math.max(20, Number(body?.config?.iter ?? 120)));
    const seed = Number(body?.config?.seed ?? Date.now());

    if (!Number.isFinite(idObra) || idObra <= 0) return fail(422, 'idObra é obrigatório');
    if (!canAccessObra(current as any, idObra)) return fail(403, 'Sem acesso à obra');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(semanaInicio)) return fail(422, 'semanaInicio inválido');
    if (!ccs.length) return fail(422, 'ccs é obrigatório');

    const rng = rand(seed);

    let melhor = autoReplanejar(ccs, capacidade, 120).ccs;
    let melhorScore = objetivo(melhor, pesoPrazo);

    for (let i = 0; i < iter; i += 1) {
      const viz = gerarVizinho(melhor, rng);
      const solved = autoReplanejar(viz, capacidade, 120);
      const score = objetivo(solved.ccs, pesoPrazo);
      if (score < melhorScore) {
        melhor = solved.ccs;
        melhorScore = score;
      }
    }

    const solvedFinal = autoReplanejar(melhor, capacidade, 200);
    const prazo = calcPrazo(solvedFinal.ccs);
    const custo = calcCusto(solvedFinal.ccs);
    const score = objetivo(solvedFinal.ccs, pesoPrazo);

    return ok({
      idObra,
      semanaInicio,
      gantt: { hoje: body?.hoje ?? 0, ccs: solvedFinal.ccs, capacidade, conflitos: solvedFinal.conflitos },
      metrics: { prazo, custo, score },
      iteracoes: iter,
      conflitosAbertos: solvedFinal.conflitos.length,
    });
  } catch (e) {
    return handleApiError(e);
  }
}

