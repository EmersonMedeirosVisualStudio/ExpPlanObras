"use client";

import { useEffect, useMemo, useState } from "react";

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

function badgeColor(status: string) {
  const s = String(status || "").toUpperCase();
  if (s === "OK" || s === "CONCLUIDO") return "bg-emerald-100 text-emerald-700";
  if (s === "ATRASADO") return "bg-red-100 text-red-700";
  return "bg-amber-100 text-amber-700";
}

const GANTT_SCALE = 90;
const GANTT_ROW = 44;

type DashboardPesData = {
  idObra: number;
  semanaInicio: string;
  semanaFim: string;
  kpis: { execucaoFisica: number | null; prazoDias: number | null; custoVariacaoPct: number | null; produtividade: number | null };
  caminhoCritico: Array<{ cc: string; status: string }>;
  programacao: Array<{
    data: string;
    cc: string | null;
    servico: string;
    pessoas: number;
    planejadoQtd: number;
    executadoQtd: number;
    execucaoPct: number | null;
    status: string;
  }>;
  recursos: {
    maoObra: { necessario: number | null; alocado: number | null; deficit: number | null };
    equipamentos: { necessario: number | null; disponivel: number | null; deficit: number | null };
    insumos: { necessario: number | null; disponivel: number | null; deficit: number | null };
  };
  desempenhoCc: Array<{ cc: string | null; planejadoQtd: number; executadoQtd: number; execucaoPct: number | null; produtividade: number | null; pessoas: number }>;
  alertas: Array<{ prioridade: string; tipo: string; mensagem: string }>;
  solicitacoes: Array<any>;
  visaoDiaria: { data: string; itens: Array<any> };
  gantt?: {
    hoje: number;
    capacidade: Record<string, number>;
    conflitos: Array<{ tempo: number; recurso: string; usado: number; capacidade: number; ccs: string[] }>;
    ccs: Array<{
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
    }>;
  };
};

type GanttCc = NonNullable<DashboardPesData["gantt"]>["ccs"][number];

export default function DashboardPesClient({ idObra }: { idObra: number }) {
  const [semanaBase, setSemanaBase] = useState(() => startOfWeekMonday(new Date().toISOString().slice(0, 10)));
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [data, setData] = useState<DashboardPesData | null>(null);
  const [replanejando, setReplanejando] = useState(false);

  const semanaInicio = useMemo(() => startOfWeekMonday(semanaBase), [semanaBase]);
  const semanaFim = useMemo(() => addDays(semanaInicio, 6), [semanaInicio]);

  async function carregar() {
    try {
      setLoading(true);
      setErr(null);
      const res = await fetch(`/api/v1/pes/dashboard?idObra=${idObra}&semanaInicio=${semanaInicio}`, { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.message || "Erro ao carregar dashboard PES");
      setData(json.data as any);
    } catch (e: any) {
      setErr(e?.message || "Erro ao carregar dashboard PES");
      setData(null);
    } finally {
      setLoading(false);
    }
  }

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
      if (gantt) {
        setData((prev) => (prev ? { ...prev, gantt } : prev));
      }
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
        body: JSON.stringify({
          idObra,
          semanaInicio,
          autoReplanejar: false,
          alteracoes: [{ id, inicio: novoInicio, fim: novoFim }],
        }),
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

  useEffect(() => {
    carregar();
  }, [idObra, semanaInicio]);

  const kpis = data?.kpis;
  const execColor = kpis?.execucaoFisica != null ? (kpis.execucaoFisica >= 1 ? "text-emerald-700" : kpis.execucaoFisica >= 0.8 ? "text-amber-700" : "text-red-700") : "text-slate-500";
  const prodColor = kpis?.produtividade != null ? (kpis.produtividade >= 1 ? "text-emerald-700" : kpis.produtividade >= 0.8 ? "text-amber-700" : "text-red-700") : "text-slate-500";

  if (loading && !data) return <div className="p-6">Carregando dashboard PES...</div>;

  return (
    <div className="p-6 space-y-6 bg-slate-100 min-h-[calc(100vh-64px)] text-slate-900">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">Dashboard Final Integrado — PES</h1>
          <div className="text-sm text-slate-600">
            Obra #{idObra} • Semana {semanaInicio} → {semanaFim}
          </div>
        </div>
        <div className="flex gap-2 items-end flex-wrap">
          <div>
            <div className="text-xs text-slate-600">Semana (segunda)</div>
            <input className="rounded-lg border bg-white px-3 py-2 text-sm" type="date" value={semanaBase} onChange={(e) => setSemanaBase(e.target.value)} />
          </div>
          <button className="rounded-lg border bg-white px-4 py-2 text-sm hover:bg-slate-50" type="button" onClick={carregar} disabled={loading}>
            Atualizar
          </button>
        </div>
      </div>

      {err ? <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div> : null}

      <div className="grid grid-cols-12 gap-4">
        <section className="col-span-12 grid grid-cols-1 gap-4 md:grid-cols-4">
          <KpiCard titulo="Execução Física" valor={pct(kpis?.execucaoFisica ?? null)} valorClass={execColor} subtitulo="executado acumulado / planejado acumulado" />
          <KpiCard titulo="Prazo (dias)" valor={kpis?.prazoDias == null ? "—" : String(kpis.prazoDias)} valorClass="text-slate-500" subtitulo="caminho crítico (engine)" />
          <KpiCard titulo="Custo (var.)" valor={kpis?.custoVariacaoPct == null ? "—" : pct(kpis.custoVariacaoPct)} valorClass="text-slate-500" subtitulo="insumos + MO + equipamentos" />
          <KpiCard titulo="Produtividade" valor={kpis?.produtividade == null ? "—" : String(kpis.produtividade.toFixed(2))} valorClass={prodColor} subtitulo="produção real / horas reais" />
        </section>

        <section className="col-span-12 rounded-xl border bg-white p-4 shadow-sm">
          <h2 className="text-lg font-semibold">Caminho Crítico (visual)</h2>
          <div className="mt-3 overflow-auto">
            <div className="inline-flex items-center gap-2">
              {(data?.caminhoCritico || []).map((n, idx) => (
                <div key={`${n.cc}-${idx}`} className="flex items-center gap-2">
                  <div className={`rounded-lg px-3 py-2 text-sm font-semibold ${badgeColor(n.status)}`}>{n.cc}</div>
                  {idx < (data?.caminhoCritico?.length || 0) - 1 ? <div className="text-slate-400">→</div> : null}
                </div>
              ))}
              {!data?.caminhoCritico?.length ? <div className="text-sm text-slate-500">Sem dados suficientes para caminho crítico.</div> : null}
            </div>
          </div>
        </section>

        <section className="col-span-12 rounded-xl border bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <h2 className="text-lg font-semibold">Gantt PES (dependências, hoje e progresso)</h2>
            <button className="rounded-lg border bg-white px-4 py-2 text-sm hover:bg-slate-50 disabled:opacity-50" type="button" onClick={autoReplanejar} disabled={replanejando}>
              {replanejando ? "Replanejando..." : "Auto-replanejar conflitos"}
            </button>
          </div>
          <div className="mt-3 text-xs text-slate-500">Regra: Início CC = max(fim dependências + latência). Dependente nunca começa antes do predecessor.</div>

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
                {(data?.gantt?.ccs || []).map((cc, idx) => (
                  <div key={cc.id} className="flex items-center gap-2" style={{ height: GANTT_ROW }}>
                    <div className="w-56 shrink-0">
                      <div className="text-sm font-medium">{cc.cc} • {cc.servico}</div>
                      <div className="text-xs text-slate-500">
                        {cc.critico ? "Crítico" : "Não crítico"} {cc.conflito ? " • Conflito" : ""}
                      </div>
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
                {!data?.gantt?.ccs?.length ? <div className="p-4 text-sm text-slate-500">Sem dados de Gantt para a semana.</div> : null}
              </div>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
            <div className="rounded-lg border bg-white p-3">
              <div className="text-sm font-semibold">Conflitos de recurso</div>
              <div className="mt-2 space-y-2">
                {(data?.gantt?.conflitos || []).map((c, idx) => (
                  <div key={`${c.tempo}-${c.recurso}-${idx}`} className="rounded border bg-red-50 p-2 text-xs text-red-700">
                    D{c.tempo + 1} • {c.recurso}: uso {c.usado} / capacidade {c.capacidade} • CCs: {c.ccs.join(", ")}
                  </div>
                ))}
                {!data?.gantt?.conflitos?.length ? <div className="text-xs text-emerald-700">Sem conflitos detectados.</div> : null}
              </div>
            </div>
            <div className="rounded-lg border bg-white p-3">
              <div className="text-sm font-semibold">Capacidade configurada (engine)</div>
              <div className="mt-2 space-y-1 text-sm">
                {Object.entries(data?.gantt?.capacidade || {}).map(([k, v]) => (
                  <div key={k} className="flex justify-between">
                    <span className="text-slate-600">{k}</span>
                    <span className="font-semibold">{v}</span>
                  </div>
                ))}
                {!Object.keys(data?.gantt?.capacidade || {}).length ? <div className="text-xs text-slate-500">Sem capacidade definida.</div> : null}
              </div>
            </div>
          </div>
        </section>

        <section className="col-span-12 rounded-xl border bg-white p-4 shadow-sm">
          <h2 className="text-lg font-semibold">Programação da Semana (por dia + CC)</h2>
          <div className="mt-3 overflow-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-slate-700">
                <tr>
                  <th className="px-3 py-2">Dia</th>
                  <th className="px-3 py-2">CC</th>
                  <th className="px-3 py-2">Serviço</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2 text-right">Pessoas</th>
                  <th className="px-3 py-2 text-right">Planejado</th>
                  <th className="px-3 py-2 text-right">Execução</th>
                </tr>
              </thead>
              <tbody>
                {(data?.programacao || []).map((r, idx) => (
                  <tr key={`${r.data}-${r.cc}-${r.servico}-${idx}`} className="border-t">
                    <td className="px-3 py-2">{r.data}</td>
                    <td className="px-3 py-2">{r.cc || "—"}</td>
                    <td className="px-3 py-2">{r.servico}</td>
                    <td className="px-3 py-2">
                      <span className={`rounded-full px-2 py-1 text-xs font-semibold ${badgeColor(r.status)}`}>{String(r.status).toUpperCase()}</span>
                    </td>
                    <td className="px-3 py-2 text-right">{r.pessoas}</td>
                    <td className="px-3 py-2 text-right">{r.planejadoQtd.toFixed(2)}</td>
                    <td className="px-3 py-2 text-right">{pct(r.execucaoPct)}</td>
                  </tr>
                ))}
                {!data?.programacao?.length ? (
                  <tr>
                    <td className="px-3 py-6 text-center text-slate-500" colSpan={7}>
                      Sem dados de programação para a semana selecionada.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>

        <section className="col-span-12 grid grid-cols-1 gap-4 md:grid-cols-3">
          <RecursoCard titulo="Mão de Obra" linhas={[{ label: "Necessário", value: data?.recursos?.maoObra?.necessario }, { label: "Alocado", value: data?.recursos?.maoObra?.alocado }, { label: "Déficit", value: data?.recursos?.maoObra?.deficit }]} acaoLabel="Solicitar RH" />
          <RecursoCard titulo="Equipamentos" linhas={[{ label: "Necessário", value: data?.recursos?.equipamentos?.necessario }, { label: "Disponível", value: data?.recursos?.equipamentos?.disponivel }, { label: "Déficit", value: data?.recursos?.equipamentos?.deficit }]} acaoLabel="Solicitar Equipamento" />
          <RecursoCard titulo="Insumos" linhas={[{ label: "Necessário", value: data?.recursos?.insumos?.necessario }, { label: "Disponível", value: data?.recursos?.insumos?.disponivel }, { label: "Déficit", value: data?.recursos?.insumos?.deficit }]} acaoLabel="Requisitar Suprimentos" />
        </section>

        <section className="col-span-12 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <section className="rounded-xl border bg-white p-4 shadow-sm">
            <h2 className="text-lg font-semibold">Desempenho por CC</h2>
            <div className="mt-3 overflow-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-left text-slate-700">
                  <tr>
                    <th className="px-3 py-2">CC</th>
                    <th className="px-3 py-2 text-right">Planejado</th>
                    <th className="px-3 py-2 text-right">Executado</th>
                    <th className="px-3 py-2 text-right">Desvio</th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.desempenhoCc || []).slice(0, 20).map((r, idx) => (
                    <tr key={`${r.cc || "SEM"}-${idx}`} className="border-t">
                      <td className="px-3 py-2">{r.cc || "—"}</td>
                      <td className="px-3 py-2 text-right">{r.planejadoQtd.toFixed(2)}</td>
                      <td className="px-3 py-2 text-right">{r.executadoQtd.toFixed(2)}</td>
                      <td className="px-3 py-2 text-right">{(r.executadoQtd - r.planejadoQtd).toFixed(2)}</td>
                    </tr>
                  ))}
                  {!data?.desempenhoCc?.length ? (
                    <tr>
                      <td className="px-3 py-6 text-center text-slate-500" colSpan={4}>
                        Sem dados.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-xl border bg-white p-4 shadow-sm">
            <h2 className="text-lg font-semibold">Produtividade (real vs previsto)</h2>
            <div className="mt-3 space-y-2">
              {(data?.desempenhoCc || []).slice(0, 12).map((r, idx) => (
                <div key={`${r.cc || "SEM"}-p-${idx}`} className="flex items-center gap-3">
                  <div className="w-28 truncate text-sm">{r.cc || "—"}</div>
                  <div className="flex-1">
                    <div className="h-2 rounded bg-slate-100">
                      <div className={`h-2 rounded ${r.produtividade != null && r.produtividade >= 1 ? "bg-emerald-500" : r.produtividade != null && r.produtividade >= 0.8 ? "bg-amber-500" : "bg-red-500"}`} style={{ width: `${Math.max(0, Math.min(100, Math.round(((r.produtividade || 0) / 1.5) * 100)))}%` }} />
                    </div>
                  </div>
                  <div className="w-16 text-right text-sm">{r.produtividade == null ? "—" : r.produtividade.toFixed(2)}</div>
                </div>
              ))}
              {!data?.desempenhoCc?.length ? <div className="text-sm text-slate-500">Sem dados.</div> : null}
            </div>
          </section>
        </section>

        <section className="col-span-12 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <section className="rounded-xl border bg-white p-4 shadow-sm">
            <h2 className="text-lg font-semibold">Alertas</h2>
            <div className="mt-3 space-y-2">
              {(data?.alertas || []).map((a, idx) => (
                <div key={`${a.tipo}-${idx}`} className="rounded-lg border bg-slate-50 p-3">
                  <div className="text-xs text-slate-500">{a.prioridade} • {a.tipo}</div>
                  <div className="text-sm text-slate-800">{a.mensagem}</div>
                </div>
              ))}
              {!data?.alertas?.length ? <div className="text-sm text-slate-500">Sem alertas.</div> : null}
            </div>
          </section>
          <section className="rounded-xl border bg-white p-4 shadow-sm">
            <h2 className="text-lg font-semibold">Solicitações</h2>
            <div className="mt-3 text-sm text-slate-500">Sem integrações de workflow ativas nesta versão.</div>
          </section>
        </section>

        <section className="col-span-12 rounded-xl border bg-white p-4 shadow-sm">
          <h2 className="text-lg font-semibold">Visão do Dia</h2>
          <div className="mt-1 text-sm text-slate-600">{data?.visaoDiaria?.data || "—"}</div>
          <div className="mt-3 overflow-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-slate-700">
                <tr>
                  <th className="px-3 py-2">CC</th>
                  <th className="px-3 py-2">Serviço</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2 text-right">Planejado</th>
                  <th className="px-3 py-2 text-right">Execução</th>
                </tr>
              </thead>
              <tbody>
                {(data?.visaoDiaria?.itens || []).map((r: any, idx: number) => (
                  <tr key={`vd-${idx}`} className="border-t">
                    <td className="px-3 py-2">{r.cc || "—"}</td>
                    <td className="px-3 py-2">{r.servico}</td>
                    <td className="px-3 py-2">
                      <span className={`rounded-full px-2 py-1 text-xs font-semibold ${badgeColor(r.status)}`}>{String(r.status).toUpperCase()}</span>
                    </td>
                    <td className="px-3 py-2 text-right">{Number(r.planejadoQtd || 0).toFixed(2)}</td>
                    <td className="px-3 py-2 text-right">{pct(r.execucaoPct ?? null)}</td>
                  </tr>
                ))}
                {!data?.visaoDiaria?.itens?.length ? (
                  <tr>
                    <td className="px-3 py-6 text-center text-slate-500" colSpan={5}>
                      Sem dados do dia.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      </div>
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

function RecursoCard({ titulo, linhas, acaoLabel }: { titulo: string; linhas: Array<{ label: string; value: number | null }>; acaoLabel: string }) {
  return (
    <div className="rounded-xl border bg-white p-4 shadow-sm">
      <div className="text-lg font-semibold">{titulo}</div>
      <div className="mt-3 space-y-1 text-sm">
        {linhas.map((l) => (
          <div key={l.label} className="flex items-center justify-between">
            <div className="text-slate-600">{l.label}</div>
            <div className="font-semibold">{l.value == null ? "—" : String(l.value)}</div>
          </div>
        ))}
      </div>
      <button className="mt-4 w-full rounded-lg border bg-white px-4 py-2 text-sm hover:bg-slate-50" type="button">
        {acaoLabel}
      </button>
    </div>
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
