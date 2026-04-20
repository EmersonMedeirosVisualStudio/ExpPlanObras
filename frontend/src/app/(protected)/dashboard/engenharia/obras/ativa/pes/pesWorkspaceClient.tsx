"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useRealtimeEvent } from "@/lib/realtime/hooks";

function startOfWeekMonday(dateIso: string) {
  const d = new Date(`${dateIso}T00:00:00`);
  const day = d.getDay();
  const diff = (day + 6) % 7;
  d.setDate(d.getDate() - diff);
  return d.toISOString().slice(0, 10);
}

function addDays(dateIso: string, days: number) {
  const d = new Date(`${dateIso}T00:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function pct(n: number | null) {
  if (n == null || Number.isNaN(n)) return "—";
  return `${Math.round(n * 100)}%`;
}

const GANTT_SCALE = 90;
const GANTT_ROW = 44;
const STORAGE_PREFIX = "pes_workspace_scenarios";

type GanttCc = {
  id: string;
  cc: string;
  servico: string;
  inicio: number;
  fim: number;
  latencia: number;
  dependencias: string[];
  progresso: number;
  pessoas: number;
  critico?: boolean;
  conflito?: boolean;
  recursos: { mo: Array<{ tipo: string; qtd: number }>; eq: Array<{ tipo: string; qtd: number }>; ins: Array<{ tipo: string; qtd: number }> };
};

type DashboardPesData = {
  idObra: number;
  semanaInicio: string;
  semanaFim: string;
  kpis: { execucaoFisica: number | null; prazoDias: number | null; custoVariacaoPct: number | null; produtividade: number | null };
  alertas: Array<{ prioridade: string; tipo: string; mensagem: string }>;
  programacao: Array<any>;
  desempenhoCc: Array<any>;
  gantt?: {
    hoje: number;
    capacidade: Record<string, number>;
    conflitos: Array<{ tempo: number; recurso: string; usado: number; capacidade: number; ccs: string[] }>;
    ccs: GanttCc[];
  };
};

type Scenario = {
  id: string;
  nome: string;
  criadoEm: string;
  semanaInicio: string;
  gantt: NonNullable<DashboardPesData["gantt"]>;
  metrics: { prazo: number; custo: number; score: number };
};

function calcPrazo(ccs: GanttCc[]) {
  return ccs.reduce((m, c) => Math.max(m, c.fim), 0);
}

function calcCusto(ccs: GanttCc[]) {
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

function calcScore(ccs: GanttCc[], pesoPrazo: number) {
  return Number((calcCusto(ccs) + pesoPrazo * calcPrazo(ccs)).toFixed(2));
}

function badgeColor(status: string) {
  const s = String(status || "").toUpperCase();
  if (s === "OK" || s === "CONCLUIDO") return "bg-emerald-100 text-emerald-700";
  if (s === "ATRASADO") return "bg-red-100 text-red-700";
  return "bg-amber-100 text-amber-700";
}

function TodayLine({ hoje }: { hoje: number }) {
  const left = hoje * GANTT_SCALE;
  return (
    <div className="absolute top-0 bottom-0 z-20 w-[2px] bg-red-600" style={{ left }}>
      <div className="absolute -top-5 -left-3 text-[10px] text-red-600">Hoje</div>
    </div>
  );
}

function DependencyLines({ ccs }: { ccs: GanttCc[] }) {
  const indexById = new Map<string, number>();
  ccs.forEach((c, i) => indexById.set(c.id, i));
  const height = Math.max(1, ccs.length) * GANTT_ROW + 10;
  const width = Math.max(1400, Math.ceil(Math.max(...ccs.map((c) => c.fim), 10) * GANTT_SCALE) + 260);
  return (
    <svg className="pointer-events-none absolute left-[224px] top-0 z-10" width={width} height={height}>
      {ccs.flatMap((cc, idx) =>
        (cc.dependencias || []).map((depId) => {
          const dep = ccs.find((x) => x.id === depId);
          const depIdx = dep ? indexById.get(dep.id) ?? -1 : -1;
          if (!dep || depIdx < 0) return null;
          const x1 = dep.fim * GANTT_SCALE;
          const y1 = depIdx * GANTT_ROW + 16;
          const x2 = cc.inicio * GANTT_SCALE;
          const y2 = idx * GANTT_ROW + 16;
          const midX = x1 + (x2 - x1) / 2;
          return <path key={`${dep.id}-${cc.id}`} d={`M ${x1} ${y1} L ${midX} ${y1} L ${midX} ${y2} L ${x2} ${y2}`} stroke={cc.critico ? "#d97706" : "#475569"} fill="none" strokeWidth="1.5" />;
        })
      )}
    </svg>
  );
}

function GanttBar({ cc }: { cc: GanttCc }) {
  const left = cc.inicio * GANTT_SCALE;
  const width = Math.max(22, (cc.fim - cc.inicio) * GANTT_SCALE);
  const progressWidth = Math.max(0, Math.min(width, width * (cc.progresso || 0)));
  const baseClass = cc.conflito ? "bg-red-200 border-red-400" : cc.critico ? "bg-amber-200 border-amber-400" : "bg-slate-200 border-slate-400";

  return (
    <div className="absolute top-1.5 h-8 rounded-lg border text-xs" style={{ left, width }}>
      <div className={`absolute inset-0 rounded-lg border ${baseClass}`} />
      <div className={`absolute left-0 top-0 h-full rounded-l-lg ${cc.conflito ? "bg-red-500" : "bg-emerald-500"}`} style={{ width: progressWidth }} />
      <div className="absolute inset-0 flex items-center justify-between px-2 text-slate-800">
        <span className="font-semibold">{cc.cc}</span>
        <span>{Math.round((cc.progresso || 0) * 100)}%</span>
      </div>
    </div>
  );
}

function SidebarItem({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      className={`w-full rounded-lg px-3 py-2 text-left text-sm ${active ? "bg-slate-900 text-white" : "text-slate-200 hover:bg-slate-800 hover:text-white"}`}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

export default function PesWorkspaceClient({ idObra }: { idObra: number }) {
  const router = useRouter();
  const [tab, setTab] = useState<"DASH" | "PLANEJAMENTO" | "GANTT" | "RECURSOS" | "ALERTAS" | "CENARIOS" | "OTIMIZACAO">("DASH");
  const [semanaBase, setSemanaBase] = useState(() => startOfWeekMonday(new Date().toISOString().slice(0, 10)));
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [data, setData] = useState<DashboardPesData | null>(null);
  const [replanejando, setReplanejando] = useState(false);
  const [pesoPrazo, setPesoPrazo] = useState(1000);
  const [iter, setIter] = useState(120);
  const [otimizando, setOtimizando] = useState(false);
  const [optResult, setOptResult] = useState<any>(null);
  const [scenarios, setScenarios] = useState<Scenario[]>([]);

  const semanaInicio = useMemo(() => startOfWeekMonday(semanaBase), [semanaBase]);
  const semanaFim = useMemo(() => addDays(semanaInicio, 6), [semanaInicio]);

  const storageKey = useMemo(() => `${STORAGE_PREFIX}:${idObra}`, [idObra]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(storageKey);
      const parsed = raw ? (JSON.parse(raw) as Scenario[]) : [];
      setScenarios(Array.isArray(parsed) ? parsed : []);
    } catch {
      setScenarios([]);
    }
  }, [storageKey]);

  function persistScenarios(next: Scenario[]) {
    setScenarios(next);
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(next));
    } catch {
    }
  }

  async function carregar() {
    try {
      setLoading(true);
      setErr(null);
      const res = await fetch(`/api/v1/pes/dashboard?idObra=${idObra}&semanaInicio=${semanaInicio}`, { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.message || "Erro ao carregar PES");
      setData(json.data as any);
    } catch (e: any) {
      setErr(e?.message || "Erro ao carregar PES");
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    carregar();
  }, [idObra, semanaInicio]);

  useRealtimeEvent("pes", "pes.refresh", () => {
    carregar();
  });

  useEffect(() => {
    const id = window.setInterval(() => {
      carregar();
    }, 5 * 60 * 1000);
    return () => window.clearInterval(id);
  }, [idObra, semanaInicio]);

  async function autoReplanejar() {
    if (!data) return;
    try {
      setReplanejando(true);
      setErr(null);
      const res = await fetch(`/api/v1/pes/dashboard`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idObra, semanaInicio, autoReplanejar: true }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.message || "Falha no auto-replanejamento");
      const gantt = json.data?.gantt;
      if (gantt) setData((prev) => (prev ? { ...prev, gantt } : prev));
      setTab("GANTT");
    } catch (e: any) {
      setErr(e?.message || "Falha no auto-replanejamento");
    } finally {
      setReplanejando(false);
    }
  }

  async function moverCcDias(id: string, dias: number) {
    if (!data?.gantt?.ccs?.length) return;
    const item = data.gantt.ccs.find((c) => c.id === id);
    if (!item) return;
    const dur = item.fim - item.inicio;
    const novoInicio = Math.max(0, item.inicio + dias);
    const novoFim = novoInicio + dur;
    try {
      setReplanejando(true);
      setErr(null);
      const res = await fetch(`/api/v1/pes/dashboard`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idObra, semanaInicio, autoReplanejar: false, alteracoes: [{ id, inicio: novoInicio, fim: novoFim }] }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.message || "Falha ao mover CC");
      const gantt = json.data?.gantt;
      if (gantt) setData((prev) => (prev ? { ...prev, gantt } : prev));
    } catch (e: any) {
      setErr(e?.message || "Falha ao mover CC");
    } finally {
      setReplanejando(false);
    }
  }

  function salvarCenario() {
    if (!data?.gantt?.ccs?.length) return;
    const id = `scn-${Date.now()}`;
    const prazo = calcPrazo(data.gantt.ccs);
    const custo = calcCusto(data.gantt.ccs);
    const score = calcScore(data.gantt.ccs, pesoPrazo);
    const scn: Scenario = {
      id,
      nome: `Cenário ${scenarios.length + 1}`,
      criadoEm: new Date().toISOString(),
      semanaInicio,
      gantt: data.gantt,
      metrics: { prazo, custo, score },
    };
    persistScenarios([scn, ...scenarios].slice(0, 20));
    setTab("CENARIOS");
  }

  async function otimizar() {
    if (!data?.gantt?.ccs?.length) return;
    try {
      setOtimizando(true);
      setErr(null);
      const res = await fetch(`/api/v1/pes/optimize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idObra,
          semanaInicio,
          ccs: data.gantt.ccs,
          capacidade: data.gantt.capacidade,
          config: { pesoPrazo, iter },
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.message || "Falha ao otimizar");
      setOptResult(json.data);
      if (json.data?.gantt) setData((prev) => (prev ? { ...prev, gantt: json.data.gantt } : prev));
      setTab("OTIMIZACAO");
    } catch (e: any) {
      setErr(e?.message || "Falha ao otimizar");
    } finally {
      setOtimizando(false);
    }
  }

  const kpis = data?.kpis;
  const execColor = kpis?.execucaoFisica != null ? (kpis.execucaoFisica >= 1 ? "text-emerald-700" : kpis.execucaoFisica >= 0.8 ? "text-amber-700" : "text-red-700") : "text-slate-500";
  const prodColor = kpis?.produtividade != null ? (kpis.produtividade >= 1 ? "text-emerald-700" : kpis.produtividade >= 0.8 ? "text-amber-700" : "text-red-700") : "text-slate-500";

  return (
    <div className="flex min-h-[calc(100vh-64px)] bg-slate-100 text-slate-900">
      <aside className="w-64 shrink-0 bg-slate-950 p-4">
        <div className="text-white font-semibold">PES</div>
        <div className="mt-1 text-xs text-slate-400">Obra #{idObra}</div>
        <div className="mt-4 space-y-1">
          <SidebarItem active={tab === "DASH"} label="Dashboard" onClick={() => setTab("DASH")} />
          <SidebarItem active={tab === "PLANEJAMENTO"} label="Planejamento (PES)" onClick={() => setTab("PLANEJAMENTO")} />
          <SidebarItem active={tab === "GANTT"} label="Gantt" onClick={() => setTab("GANTT")} />
          <SidebarItem active={tab === "RECURSOS"} label="Recursos" onClick={() => setTab("RECURSOS")} />
          <SidebarItem active={tab === "ALERTAS"} label="Alertas" onClick={() => setTab("ALERTAS")} />
          <SidebarItem active={tab === "CENARIOS"} label="Cenários" onClick={() => setTab("CENARIOS")} />
          <SidebarItem active={tab === "OTIMIZACAO"} label="Otimização" onClick={() => setTab("OTIMIZACAO")} />
        </div>

        <div className="mt-6 rounded-lg bg-slate-900 p-3">
          <div className="text-xs text-slate-400">Semana (segunda)</div>
          <input className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white" type="date" value={semanaBase} onChange={(e) => setSemanaBase(e.target.value)} />
          <div className="mt-2 text-xs text-slate-400">
            {semanaInicio} → {semanaFim}
          </div>
          <button className="mt-3 w-full rounded-lg bg-white px-3 py-2 text-sm font-semibold text-slate-900 disabled:opacity-50" type="button" onClick={carregar} disabled={loading}>
            {loading ? "Atualizando..." : "Atualizar"}
          </button>
        </div>

        <div className="mt-4 space-y-2">
          <button className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white hover:bg-slate-900 disabled:opacity-50" type="button" onClick={autoReplanejar} disabled={replanejando}>
            {replanejando ? "Replanejando..." : "Auto-replanejar"}
          </button>
          <button className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white hover:bg-slate-900 disabled:opacity-50" type="button" onClick={salvarCenario} disabled={!data?.gantt?.ccs?.length}>
            Salvar cenário
          </button>
          <button className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white hover:bg-slate-900 disabled:opacity-50" type="button" onClick={otimizar} disabled={otimizando || !data?.gantt?.ccs?.length}>
            {otimizando ? "Otimizando..." : "Otimizar"}
          </button>
        </div>
      </aside>

      <main className="flex-1 p-6 space-y-6">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-semibold">PES — Workspace</h1>
            <div className="text-sm text-slate-600">Planejamento por CC, Gantt, recursos, alertas e otimização.</div>
          </div>
          <div className="flex gap-2 flex-wrap">
            <button className="rounded-lg border bg-white px-4 py-2 text-sm hover:bg-slate-50" type="button" onClick={() => router.push("/dashboard/engenharia/obras/ativa/programacao-semanal")}>
              Abrir PES (execução)
            </button>
            <button className="rounded-lg border bg-white px-4 py-2 text-sm hover:bg-slate-50" type="button" onClick={() => router.push("/dashboard/engenharia/obras/ativa/pes-dashboard")}>
              Abrir Dashboard PES (compacto)
            </button>
          </div>
        </div>

        {err ? <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div> : null}

        {tab === "DASH" ? (
          <div className="grid grid-cols-12 gap-4">
            <section className="col-span-12 grid grid-cols-1 gap-4 md:grid-cols-4">
              <KpiCard titulo="Execução Física" valor={pct(kpis?.execucaoFisica ?? null)} valorClass={execColor} subtitulo="executado acumulado / planejado acumulado" />
              <KpiCard titulo="Prazo (dias)" valor={kpis?.prazoDias == null ? "—" : String(kpis.prazoDias)} valorClass="text-slate-500" subtitulo="caminho crítico (engine)" />
              <KpiCard titulo="Custo (var.)" valor={kpis?.custoVariacaoPct == null ? "—" : pct(kpis.custoVariacaoPct)} valorClass="text-slate-500" subtitulo="quando disponível" />
              <KpiCard titulo="Produtividade" valor={kpis?.produtividade == null ? "—" : String(kpis.produtividade.toFixed(2))} valorClass={prodColor} subtitulo="produção real / horas reais" />
            </section>

            <section className="col-span-12 rounded-xl border bg-white p-4 shadow-sm">
              <div className="text-lg font-semibold">Alertas</div>
              <div className="mt-3 space-y-2">
                {(data?.alertas || []).slice(0, 8).map((a, idx) => (
                  <div key={`${a.tipo}-${idx}`} className="rounded-lg border bg-slate-50 p-3">
                    <div className="text-xs text-slate-500">
                      {a.prioridade} • {a.tipo}
                    </div>
                    <div className="text-sm text-slate-800">{a.mensagem}</div>
                  </div>
                ))}
                {!data?.alertas?.length ? <div className="text-sm text-slate-500">Sem alertas.</div> : null}
              </div>
            </section>
          </div>
        ) : null}

        {tab === "PLANEJAMENTO" ? (
          <div className="rounded-xl border bg-white p-4 shadow-sm space-y-3">
            <div className="text-lg font-semibold">Planejamento (PES)</div>
            <div className="text-sm text-slate-600">Nesta versão, o planejamento operacional detalhado está na tela PES (execução). O Workspace consolida Gantt, conflitos, cenários e otimização.</div>
            <button className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white" type="button" onClick={() => router.push("/dashboard/engenharia/obras/ativa/programacao-semanal")}>
              Ir para PES (execução)
            </button>
          </div>
        ) : null}

        {tab === "GANTT" ? (
          <section className="rounded-xl border bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <div className="text-lg font-semibold">Gantt</div>
                <div className="text-xs text-slate-500">Linha do hoje + progresso + dependências + conflito.</div>
              </div>
              <div className="flex gap-2 flex-wrap">
                <div className="rounded-lg border bg-slate-50 px-3 py-2 text-xs text-slate-700">Conflitos: {data?.gantt?.conflitos?.length || 0}</div>
                <div className="rounded-lg border bg-slate-50 px-3 py-2 text-xs text-slate-700">CCs: {data?.gantt?.ccs?.length || 0}</div>
              </div>
            </div>

            <div className="mt-4 overflow-auto">
              <div className="min-w-[1100px]">
                <div className="flex mb-2">
                  <div className="w-56 shrink-0" />
                  {Array.from({ length: Math.max(10, Math.ceil(Math.max(...(data?.gantt?.ccs?.map((c) => c.fim) || [7])))) }).map((_, i) => (
                    <div key={i} className="text-center text-xs text-slate-500" style={{ width: GANTT_SCALE }}>
                      D{i + 1}
                    </div>
                  ))}
                </div>
                <div className="relative rounded-lg border bg-slate-50/60 p-2">
                  <TodayLine hoje={data?.gantt?.hoje || 0} />
                  <DependencyLines ccs={data?.gantt?.ccs || []} />
                  {(data?.gantt?.ccs || []).map((cc) => (
                    <div key={cc.id} className="flex items-center gap-2" style={{ height: GANTT_ROW }}>
                      <div className="w-56 shrink-0">
                        <div className="text-sm font-medium">
                          {cc.cc} • {cc.servico}
                        </div>
                        <div className="text-xs text-slate-500">{cc.critico ? "Crítico" : "Não crítico"}{cc.conflito ? " • Conflito" : ""}</div>
                      </div>
                      <div className="relative flex-1 border-b border-slate-200">
                        <GanttBar cc={cc} />
                      </div>
                      <div className="flex gap-1">
                        <button className="rounded border bg-white px-2 py-1 text-xs hover:bg-slate-50 disabled:opacity-50" type="button" disabled={replanejando} onClick={() => moverCcDias(cc.id, -1)}>
                          -1d
                        </button>
                        <button className="rounded border bg-white px-2 py-1 text-xs hover:bg-slate-50 disabled:opacity-50" type="button" disabled={replanejando} onClick={() => moverCcDias(cc.id, 1)}>
                          +1d
                        </button>
                      </div>
                    </div>
                  ))}
                  {!data?.gantt?.ccs?.length ? <div className="p-4 text-sm text-slate-500">Sem dados de Gantt.</div> : null}
                </div>
              </div>
            </div>
          </section>
        ) : null}

        {tab === "RECURSOS" ? (
          <section className="rounded-xl border bg-white p-4 shadow-sm">
            <div className="text-lg font-semibold">Recursos</div>
            <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
              <div className="rounded-lg border bg-white p-3">
                <div className="text-sm font-semibold">Capacidade (engine)</div>
                <div className="mt-2 space-y-1 text-sm">
                  {Object.entries(data?.gantt?.capacidade || {}).map(([k, v]) => (
                    <div key={k} className="flex justify-between">
                      <span className="text-slate-600">{k}</span>
                      <span className="font-semibold">{v}</span>
                    </div>
                  ))}
                  {!Object.keys(data?.gantt?.capacidade || {}).length ? <div className="text-xs text-slate-500">Sem capacidade.</div> : null}
                </div>
              </div>
              <div className="rounded-lg border bg-white p-3">
                <div className="text-sm font-semibold">Configuração de Otimização</div>
                <div className="mt-2 grid grid-cols-1 gap-3 md:grid-cols-2">
                  <div>
                    <div className="text-xs text-slate-600">Peso prazo</div>
                    <input className="input" value={String(pesoPrazo)} onChange={(e) => setPesoPrazo(Number(e.target.value || 0))} />
                  </div>
                  <div>
                    <div className="text-xs text-slate-600">Iterações</div>
                    <input className="input" value={String(iter)} onChange={(e) => setIter(Number(e.target.value || 0))} />
                  </div>
                </div>
              </div>
            </div>
          </section>
        ) : null}

        {tab === "ALERTAS" ? (
          <section className="rounded-xl border bg-white p-4 shadow-sm">
            <div className="text-lg font-semibold">Alertas</div>
            <div className="mt-3 space-y-2">
              {(data?.alertas || []).map((a, idx) => (
                <div key={`${a.tipo}-${idx}`} className="rounded-lg border bg-slate-50 p-3">
                  <div className="text-xs text-slate-500">
                    {a.prioridade} • {a.tipo}
                  </div>
                  <div className="text-sm text-slate-800">{a.mensagem}</div>
                </div>
              ))}
              {!data?.alertas?.length ? <div className="text-sm text-slate-500">Sem alertas.</div> : null}
            </div>
            <div className="mt-4 rounded-lg border bg-white p-3">
              <div className="text-sm font-semibold">Conflitos (detalhe)</div>
              <div className="mt-2 space-y-2">
                {(data?.gantt?.conflitos || []).map((c, idx) => (
                  <div key={`${c.tempo}-${c.recurso}-${idx}`} className="rounded border bg-red-50 p-2 text-xs text-red-700">
                    D{c.tempo + 1} • {c.recurso}: uso {c.usado} / capacidade {c.capacidade} • CCs: {c.ccs.join(", ")}
                  </div>
                ))}
                {!data?.gantt?.conflitos?.length ? <div className="text-xs text-emerald-700">Sem conflitos.</div> : null}
              </div>
            </div>
          </section>
        ) : null}

        {tab === "CENARIOS" ? (
          <section className="rounded-xl border bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <div className="text-lg font-semibold">Cenários</div>
                <div className="text-xs text-slate-500">Salvos no navegador (MVP).</div>
              </div>
              <button className="rounded-lg border bg-white px-4 py-2 text-sm hover:bg-slate-50 disabled:opacity-50" type="button" onClick={salvarCenario} disabled={!data?.gantt?.ccs?.length}>
                Salvar cenário atual
              </button>
            </div>
            <div className="mt-4 overflow-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-left text-slate-700">
                  <tr>
                    <th className="px-3 py-2">Nome</th>
                    <th className="px-3 py-2">Semana</th>
                    <th className="px-3 py-2 text-right">Prazo</th>
                    <th className="px-3 py-2 text-right">Custo</th>
                    <th className="px-3 py-2 text-right">Score</th>
                    <th className="px-3 py-2">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {scenarios.map((s) => (
                    <tr key={s.id} className="border-t">
                      <td className="px-3 py-2 font-medium">{s.nome}</td>
                      <td className="px-3 py-2">{s.semanaInicio}</td>
                      <td className="px-3 py-2 text-right">{s.metrics.prazo.toFixed(2)}d</td>
                      <td className="px-3 py-2 text-right">{s.metrics.custo.toFixed(2)}</td>
                      <td className="px-3 py-2 text-right">{s.metrics.score.toFixed(2)}</td>
                      <td className="px-3 py-2">
                        <div className="flex gap-2">
                          <button
                            className="rounded border bg-white px-2 py-1 text-xs hover:bg-slate-50 disabled:opacity-50"
                            type="button"
                            disabled={s.semanaInicio !== semanaInicio}
                            onClick={() => setData((p) => (p ? { ...p, gantt: s.gantt } : p))}
                          >
                            Aplicar
                          </button>
                          <button
                            className="rounded border bg-white px-2 py-1 text-xs hover:bg-slate-50"
                            type="button"
                            onClick={() => persistScenarios(scenarios.filter((x) => x.id !== s.id))}
                          >
                            Remover
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {!scenarios.length ? (
                    <tr>
                      <td colSpan={6} className="px-3 py-6 text-center text-slate-500">
                        Nenhum cenário salvo.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}

        {tab === "OTIMIZACAO" ? (
          <section className="rounded-xl border bg-white p-4 shadow-sm space-y-3">
            <div className="text-lg font-semibold">Otimização</div>
            <div className="text-sm text-slate-600">Objetivo: minimizar custo + pesoPrazo × prazo, respeitando dependências e capacidade de recursos.</div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <div>
                <div className="text-xs text-slate-600">Peso prazo</div>
                <input className="input" value={String(pesoPrazo)} onChange={(e) => setPesoPrazo(Number(e.target.value || 0))} />
              </div>
              <div>
                <div className="text-xs text-slate-600">Iterações</div>
                <input className="input" value={String(iter)} onChange={(e) => setIter(Number(e.target.value || 0))} />
              </div>
              <div className="flex items-end">
                <button className="w-full rounded-lg bg-blue-600 px-4 py-2 text-sm text-white disabled:opacity-50" type="button" onClick={otimizar} disabled={otimizando || !data?.gantt?.ccs?.length}>
                  {otimizando ? "Otimizando..." : "Rodar otimização"}
                </button>
              </div>
            </div>
            {optResult ? (
              <div className="rounded-lg border bg-slate-50 p-3 text-sm">
                <div className="font-semibold">Resultado</div>
                <div className="mt-1 grid grid-cols-1 gap-2 md:grid-cols-3">
                  <div>Prazo: <span className="font-semibold">{Number(optResult.metrics?.prazo || 0).toFixed(2)}d</span></div>
                  <div>Custo: <span className="font-semibold">{Number(optResult.metrics?.custo || 0).toFixed(2)}</span></div>
                  <div>Score: <span className="font-semibold">{Number(optResult.metrics?.score || 0).toFixed(2)}</span></div>
                </div>
                <div className="mt-2 text-xs text-slate-500">Iterações: {optResult.iteracoes} • Conflitos abertos: {optResult.conflitosAbertos}</div>
              </div>
            ) : null}
          </section>
        ) : null}
      </main>
    </div>
  );
}

function KpiCard({ titulo, valor, subtitulo, valorClass }: { titulo: string; valor: string; subtitulo: string; valorClass: string }) {
  return (
    <div className="rounded-xl border bg-white p-4 shadow-sm">
      <div className="text-sm text-slate-600">{titulo}</div>
      <div className={`mt-1 text-2xl font-semibold ${valorClass}`}>{valor}</div>
      <div className="mt-1 text-xs text-slate-500">{subtitulo}</div>
    </div>
  );
}
