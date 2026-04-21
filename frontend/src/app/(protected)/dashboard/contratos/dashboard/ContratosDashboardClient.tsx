"use client";

import { useEffect, useMemo, useState } from "react";
import api from "@/lib/api";
import { realtimeClient } from "@/lib/realtime/client";

type DashboardKpis = {
  totalContratos: number;
  valorContratado: number;
  valorExecutado: number;
  valorPago: number;
  saldoAReceber: number;
  saldoAExecutar: number;
  percentualExecucaoFinanceira: number | null;
  vencendoEm30Dias: number;
  atrasados: number;
};

type DashboardCards = {
  total: number;
  emAndamento: number;
  aVencer: number;
  vencidos: number;
  concluidos: number;
  semRecursos: number;
};

type DashboardAlerta = {
  codigo: string;
  titulo: string;
  severidade: "ALERTA" | "CRITICO";
  quantidade: number;
};

type PrazoCriticoRow = {
  contratoId: number;
  numeroContrato: string;
  objeto: string | null;
  vigenciaAtual: string;
  diasRestantes: number;
  situacao: "VENCIDO" | "A_VENCER" | "EM_ANDAMENTO";
};

type AditivosPorSituacao = {
  aprovados: number;
  pendentes: number;
  cancelados: number;
};

type AtividadeRecente = {
  id: number;
  contratoId: number;
  numeroContrato: string | null;
  tipoOrigem: string;
  tipoEvento: string;
  descricao: string;
  criadoEm: string;
};

type ContratosPorTipo = { tipo: string; quantidade: number };

type SerieContratadoExecutado = { mes: string; valorContratado: number; valorExecutado: number };

const DASH_COLORS = {
  primary: "#2563eb",
  green: "#16a34a",
  amber: "#f59e0b",
  red: "#ef4444",
  purple: "#7c3aed",
  slate: "#64748b",
  bg: "#f4f7fb",
  border: "#e6edf5",
};

function moeda(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function pct(v: number | null | undefined) {
  if (v == null || !Number.isFinite(v)) return "—";
  return `${Number(v).toFixed(1)}%`;
}

function severidadeUi(s: DashboardAlerta["severidade"]) {
  if (s === "CRITICO") return { icon: "🔴", className: "text-red-700 dark:text-red-300" };
  return { icon: "🟡", className: "text-amber-700 dark:text-amber-300" };
}

function iconBoxStyle(color: string) {
  return { backgroundColor: color };
}

export default function ContratosDashboardClient() {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [kpis, setKpis] = useState<DashboardKpis | null>(null);
  const [cards, setCards] = useState<DashboardCards | null>(null);
  const [alertas, setAlertas] = useState<DashboardAlerta[]>([]);
  const [prazoCritico, setPrazoCritico] = useState<PrazoCriticoRow[]>([]);
  const [aditivosPorSituacao, setAditivosPorSituacao] = useState<AditivosPorSituacao | null>(null);
  const [atividades, setAtividades] = useState<AtividadeRecente[]>([]);
  const [porTipo, setPorTipo] = useState<ContratosPorTipo[]>([]);
  const [serie, setSerie] = useState<SerieContratadoExecutado[]>([]);

  const [periodo, setPeriodo] = useState(() => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    return `${y}-${m}`;
  });

  const query = useMemo(() => {
    const p = new URLSearchParams();
    if (status) p.set("status", status);
    const s = p.toString();
    return s ? `?${s}` : "";
  }, [status]);

  async function carregar() {
    try {
      setLoading(true);
      setErr(null);
      const res = await api.get(`/api/contratos/dashboard${query}`);
      const data = res.data as any;
      setKpis(data?.kpis ?? null);
      setCards(data?.cards ?? null);
      setAlertas((data?.alertas ?? []) as DashboardAlerta[]);
      setPrazoCritico((data?.prazoCritico ?? []) as PrazoCriticoRow[]);
      setAditivosPorSituacao((data?.aditivosPorSituacao ?? null) as any);
      setAtividades((data?.atividadesRecentes ?? []) as AtividadeRecente[]);
      setPorTipo((data?.contratosPorTipo ?? []) as ContratosPorTipo[]);
      setSerie((data?.serieContratadoExecutado ?? []) as SerieContratadoExecutado[]);
    } catch (e: any) {
      setKpis(null);
      setCards(null);
      setAlertas([]);
      setPrazoCritico([]);
      setAditivosPorSituacao(null);
      setAtividades([]);
      setPorTipo([]);
      setSerie([]);
      setErr(e?.response?.data?.message || e?.message || "Erro ao carregar dashboard de contratos");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    carregar();
  }, []);

  useEffect(() => {
    realtimeClient.start(["contratos"]);
    const unsubs = [
      realtimeClient.subscribe("contratos", "contrato_atualizado", () => carregar()),
      realtimeClient.subscribe("contratos", "evento_criado", () => carregar()),
      realtimeClient.subscribe("contratos", "anexo_criado", () => carregar()),
    ];
    return () => {
      for (const u of unsubs) u();
    };
  }, [query]);

  const situacaoTotal = Math.max(1, Number(cards?.total ?? 0));
  const donutParts = useMemo(() => {
    const parts = [
      { label: "Em andamento", value: Number(cards?.emAndamento ?? 0), color: DASH_COLORS.green },
      { label: "A vencer (≤ 30 dias)", value: Number(cards?.aVencer ?? 0), color: DASH_COLORS.amber },
      { label: "Vencidos", value: Number(cards?.vencidos ?? 0), color: DASH_COLORS.red },
      { label: "Concluídos", value: Number(cards?.concluidos ?? 0), color: DASH_COLORS.purple },
      { label: "Sem recursos", value: Number(cards?.semRecursos ?? 0), color: DASH_COLORS.slate },
    ].filter((p) => p.value > 0);
    const sum = parts.reduce((acc, p) => acc + p.value, 0) || 1;
    let cursor = 0;
    const stops = parts.map((p) => {
      const start = cursor;
      const end = cursor + (p.value / sum) * 100;
      cursor = end;
      return { ...p, start, end };
    });
    const gradient = stops.map((s) => `${s.color} ${s.start.toFixed(2)}% ${s.end.toFixed(2)}%`).join(", ");
    return { stops, gradient, sum };
  }, [cards]);

  const serieMax = useMemo(() => {
    let max = 0;
    for (const p of serie) {
      max = Math.max(max, Number(p.valorContratado || 0), Number(p.valorExecutado || 0));
    }
    return max || 1;
  }, [serie]);

  return (
    <div className="p-6 space-y-6 text-slate-900 dark:text-slate-100 bg-[#f4f7fb] dark:bg-slate-950">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">Dashboard de Contratos</h1>
          <div className="text-sm text-slate-600 dark:text-slate-300">Visão geral da gestão dos contratos.</div>
        </div>

        <div className="flex items-end gap-2 flex-wrap">
          <div>
            <div className="text-xs text-slate-500 dark:text-slate-300">Período</div>
            <input className="input w-[140px]" type="month" value={periodo} onChange={(e) => setPeriodo(e.target.value)} />
          </div>
          <div>
            <div className="text-xs text-slate-500 dark:text-slate-300">Status</div>
            <select className="input w-[170px]" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">Todos</option>
              <option value="ATIVO">Ativo</option>
              <option value="PENDENTE">Pendente</option>
              <option value="PARALISADO">Paralisado</option>
              <option value="ENCERRADO">Encerrado</option>
              <option value="FINALIZADO">Finalizado</option>
              <option value="CANCELADO">Cancelado</option>
              <option value="RESCINDIDO">Rescindido</option>
            </select>
          </div>
          <button className="rounded-lg border bg-white px-4 py-2 text-sm hover:bg-slate-50 dark:bg-slate-900 dark:border-slate-700 dark:hover:bg-slate-800" type="button" onClick={carregar} disabled={loading}>
            {loading ? "Atualizando..." : "Atualizar"}
          </button>
        </div>
      </div>

      {err ? <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div> : null}

      <section className="grid grid-cols-1 gap-4 md:grid-cols-6">
        <div className="rounded-xl border border-[#e6edf5] bg-white p-4 shadow-sm dark:bg-slate-900 dark:border-slate-700">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl flex items-center justify-center text-white" style={iconBoxStyle(DASH_COLORS.primary)}>
              📄
            </div>
            <div className="min-w-0">
              <div className="text-xs text-slate-500 dark:text-slate-300">Total de contratos</div>
              <div className="text-2xl font-semibold">{cards?.total ?? kpis?.totalContratos ?? 0}</div>
            </div>
          </div>
        </div>
        <div className="rounded-xl border border-[#e6edf5] bg-white p-4 shadow-sm dark:bg-slate-900 dark:border-slate-700">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl flex items-center justify-center text-white" style={iconBoxStyle(DASH_COLORS.green)}>
              📈
            </div>
            <div className="min-w-0">
              <div className="text-xs text-slate-500 dark:text-slate-300">Em andamento</div>
              <div className="text-2xl font-semibold">{cards?.emAndamento ?? 0}</div>
              <div className="text-xs text-slate-500 dark:text-slate-300">{(((cards?.emAndamento ?? 0) / situacaoTotal) * 100).toFixed(1)}% do total</div>
            </div>
          </div>
        </div>
        <div className="rounded-xl border border-[#e6edf5] bg-white p-4 shadow-sm dark:bg-slate-900 dark:border-slate-700">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl flex items-center justify-center text-white" style={iconBoxStyle(DASH_COLORS.amber)}>
              ⏰
            </div>
            <div className="min-w-0">
              <div className="text-xs text-slate-500 dark:text-slate-300">A vencer (≤ 30 dias)</div>
              <div className="text-2xl font-semibold">{cards?.aVencer ?? kpis?.vencendoEm30Dias ?? 0}</div>
            </div>
          </div>
        </div>
        <div className="rounded-xl border border-[#e6edf5] bg-white p-4 shadow-sm dark:bg-slate-900 dark:border-slate-700">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl flex items-center justify-center text-white" style={iconBoxStyle(DASH_COLORS.red)}>
              ⚠
            </div>
            <div className="min-w-0">
              <div className="text-xs text-slate-500 dark:text-slate-300">Vencidos</div>
              <div className="text-2xl font-semibold">{cards?.vencidos ?? kpis?.atrasados ?? 0}</div>
            </div>
          </div>
        </div>
        <div className="rounded-xl border border-[#e6edf5] bg-white p-4 shadow-sm dark:bg-slate-900 dark:border-slate-700">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl flex items-center justify-center text-white" style={iconBoxStyle(DASH_COLORS.purple)}>
              🏁
            </div>
            <div className="min-w-0">
              <div className="text-xs text-slate-500 dark:text-slate-300">Concluídos</div>
              <div className="text-2xl font-semibold">{cards?.concluidos ?? 0}</div>
            </div>
          </div>
        </div>
        <div className="rounded-xl border border-[#e6edf5] bg-white p-4 shadow-sm dark:bg-slate-900 dark:border-slate-700">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl flex items-center justify-center text-white" style={iconBoxStyle(DASH_COLORS.slate)}>
              ⛔
            </div>
            <div className="min-w-0">
              <div className="text-xs text-slate-500 dark:text-slate-300">Sem recursos</div>
              <div className="text-2xl font-semibold">{cards?.semRecursos ?? 0}</div>
            </div>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="rounded-xl border border-[#e6edf5] bg-white p-4 shadow-sm dark:bg-slate-900 dark:border-slate-700">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className="text-sm font-semibold">Situação dos contratos</div>
            <div className="text-xs text-slate-500 dark:text-slate-300">Total: {cards?.total ?? 0}</div>
          </div>
          <div className="flex items-center gap-4">
            <div
              className="h-32 w-32 rounded-full"
              style={{
                background: `conic-gradient(${donutParts.gradient || "#e2e8f0 0% 100%"})`,
              }}
            />
            <div className="space-y-2 text-sm">
              {donutParts.stops.map((p) => (
                <div key={p.label} className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: p.color }} />
                    <span className="text-slate-700 dark:text-slate-200">{p.label}</span>
                  </div>
                  <div className="font-semibold">{p.value}</div>
                </div>
              ))}
              {!donutParts.stops.length ? <div className="text-slate-500 dark:text-slate-300">Sem dados.</div> : null}
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-[#e6edf5] bg-white p-4 shadow-sm dark:bg-slate-900 dark:border-slate-700 lg:col-span-1">
          <div className="text-sm font-semibold">Valor contratado x executado</div>
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-300">Últimos 6 meses</div>

          <div className="mt-4 flex items-end gap-2 h-40">
            {serie.map((p) => {
              const hc = Math.round((Number(p.valorContratado || 0) / serieMax) * 100);
              const he = Math.round((Number(p.valorExecutado || 0) / serieMax) * 100);
              return (
                <div key={p.mes} className="flex-1 flex flex-col items-center gap-1">
                  <div className="w-full flex items-end gap-1 h-32">
                    <div className="flex-1 rounded" style={{ height: `${hc}%`, background: `${DASH_COLORS.primary}B3` }} />
                    <div className="flex-1 rounded" style={{ height: `${he}%`, background: `${DASH_COLORS.green}B3` }} />
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-300">{p.mes.slice(5)}</div>
                </div>
              );
            })}
            {!serie.length ? <div className="text-sm text-slate-500 dark:text-slate-300">Sem série.</div> : null}
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
            <div className="flex items-center gap-2">
              <span className="inline-block h-2.5 w-2.5 rounded" style={{ background: `${DASH_COLORS.primary}B3` }} />
              <span className="text-slate-600 dark:text-slate-300">Contratado</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-block h-2.5 w-2.5 rounded" style={{ background: `${DASH_COLORS.green}B3` }} />
              <span className="text-slate-600 dark:text-slate-300">Executado</span>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-lg border bg-slate-50 p-3 dark:bg-slate-800 dark:border-slate-700">
              <div className="text-xs text-slate-500 dark:text-slate-300">Valor contratado</div>
              <div className="font-semibold">{moeda(kpis?.valorContratado ?? 0)}</div>
            </div>
            <div className="rounded-lg border bg-slate-50 p-3 dark:bg-slate-800 dark:border-slate-700">
              <div className="text-xs text-slate-500 dark:text-slate-300">Valor executado</div>
              <div className="font-semibold">{moeda(kpis?.valorExecutado ?? 0)}</div>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-[#e6edf5] bg-white p-4 shadow-sm dark:bg-slate-900 dark:border-slate-700">
          <div className="flex items-center justify-between gap-2">
            <div className="text-sm font-semibold">Alertas</div>
          </div>
          <div className="mt-3 space-y-2">
            {alertas.map((a) => (
              <div key={a.codigo} className="rounded-lg border border-[#e6edf5] bg-slate-50 p-3 text-sm dark:bg-slate-800 dark:border-slate-700">
                <div className="flex items-center justify-between gap-2">
                  <div className={`flex items-center gap-2 font-semibold ${severidadeUi(a.severidade).className}`}>
                    <span>{severidadeUi(a.severidade).icon}</span>
                    <span className="text-slate-900 dark:text-slate-100">{a.titulo}</span>
                  </div>
                  <div className="font-semibold">{a.quantidade}</div>
                </div>
              </div>
            ))}
            {!alertas.length ? <div className="text-sm text-slate-500 dark:text-slate-300">Sem alertas.</div> : null}
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-4">
        <div className="rounded-xl border bg-white p-4 shadow-sm dark:bg-slate-900 dark:border-slate-700">
          <div className="text-sm font-semibold">Medições</div>
          <div className="mt-2 text-xs text-slate-500 dark:text-slate-300">Total medido</div>
          <div className="text-xl font-semibold">{moeda(kpis?.valorExecutado ?? 0)}</div>
          <div className="mt-2 text-xs text-slate-500 dark:text-slate-300">{pct(kpis?.percentualExecucaoFinanceira)}</div>
        </div>
        <div className="rounded-xl border bg-white p-4 shadow-sm dark:bg-slate-900 dark:border-slate-700">
          <div className="text-sm font-semibold">Pagamentos</div>
          <div className="mt-2 text-xs text-slate-500 dark:text-slate-300">Total pago</div>
          <div className="text-xl font-semibold">{moeda(kpis?.valorPago ?? 0)}</div>
          <div className="mt-2 text-xs text-slate-500 dark:text-slate-300">Saldo a receber: {moeda(kpis?.saldoAReceber ?? 0)}</div>
        </div>
        <div className="rounded-xl border bg-white p-4 shadow-sm dark:bg-slate-900 dark:border-slate-700">
          <div className="text-sm font-semibold">Execução financeira (média)</div>
          <div className="mt-3 flex items-center gap-4">
            <div className="h-20 w-20 rounded-full border bg-slate-50 flex items-center justify-center text-lg font-semibold dark:bg-slate-800 dark:border-slate-700">
              {pct(kpis?.percentualExecucaoFinanceira)}
            </div>
            <div className="text-sm text-slate-600 dark:text-slate-300">
              <div>Executado: {moeda(kpis?.valorExecutado ?? 0)}</div>
              <div>Contratado: {moeda(kpis?.valorContratado ?? 0)}</div>
            </div>
          </div>
        </div>
        <div className="rounded-xl border bg-white p-4 shadow-sm dark:bg-slate-900 dark:border-slate-700">
          <div className="text-sm font-semibold">Aditivos por situação</div>
          <div className="mt-3 space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <div className="text-slate-600 dark:text-slate-300">Aprovados</div>
              <div className="font-semibold">{aditivosPorSituacao?.aprovados ?? 0}</div>
            </div>
            <div className="flex items-center justify-between">
              <div className="text-slate-600 dark:text-slate-300">Pendentes</div>
              <div className="font-semibold">{aditivosPorSituacao?.pendentes ?? 0}</div>
            </div>
            <div className="flex items-center justify-between">
              <div className="text-slate-600 dark:text-slate-300">Cancelados</div>
              <div className="font-semibold">{aditivosPorSituacao?.cancelados ?? 0}</div>
            </div>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="rounded-xl border bg-white p-4 shadow-sm dark:bg-slate-900 dark:border-slate-700 xl:col-span-2">
          <div className="text-sm font-semibold">Contratos com prazo crítico</div>
          <div className="mt-3 overflow-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                <tr>
                  <th className="px-3 py-2">Contrato</th>
                  <th className="px-3 py-2">Objeto</th>
                  <th className="px-3 py-2">Vigência</th>
                  <th className="px-3 py-2 text-right">Dias</th>
                  <th className="px-3 py-2">Situação</th>
                </tr>
              </thead>
              <tbody className="text-slate-900 dark:text-slate-100">
                {prazoCritico.map((r) => (
                  <tr key={r.contratoId} className="border-t dark:border-slate-700">
                    <td className="px-3 py-2 font-semibold">{r.numeroContrato}</td>
                    <td className="px-3 py-2">{r.objeto || "—"}</td>
                    <td className="px-3 py-2">{new Date(r.vigenciaAtual).toLocaleDateString("pt-BR")}</td>
                    <td className={`px-3 py-2 text-right ${r.diasRestantes < 0 ? "text-red-700 dark:text-red-300" : r.diasRestantes <= 30 ? "text-amber-700 dark:text-amber-300" : ""}`}>{r.diasRestantes}</td>
                    <td className="px-3 py-2">
                      {r.situacao === "VENCIDO" ? "Vencido" : r.situacao === "A_VENCER" ? "A vencer" : "Em andamento"}
                    </td>
                  </tr>
                ))}
                {!prazoCritico.length ? (
                  <tr>
                    <td colSpan={5} className="px-3 py-6 text-center text-slate-500 dark:text-slate-300">
                      Sem contratos críticos.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-xl border bg-white p-4 shadow-sm dark:bg-slate-900 dark:border-slate-700">
            <div className="text-sm font-semibold">Atividades recentes</div>
            <div className="mt-3 space-y-2 text-sm">
              {atividades.map((a) => (
                <div key={a.id} className="rounded-lg border bg-slate-50 p-3 dark:bg-slate-800 dark:border-slate-700">
                  <div className="font-semibold">{a.descricao}</div>
                  <div className="mt-1 text-xs text-slate-500 dark:text-slate-300">
                    {a.numeroContrato ? `${a.numeroContrato} • ` : ""}
                    {new Date(a.criadoEm).toLocaleString("pt-BR")}
                  </div>
                </div>
              ))}
              {!atividades.length ? <div className="text-sm text-slate-500 dark:text-slate-300">Sem atividades.</div> : null}
            </div>
          </div>

          <div className="rounded-xl border bg-white p-4 shadow-sm dark:bg-slate-900 dark:border-slate-700">
            <div className="text-sm font-semibold">Contratos por tipo</div>
            <div className="mt-3 space-y-2 text-sm">
              {porTipo.map((p) => (
                <div key={p.tipo} className="flex items-center gap-3">
                  <div className="w-16 text-slate-600 dark:text-slate-300">{p.tipo}</div>
                  <div className="flex-1 h-2 rounded bg-slate-100 dark:bg-slate-800 overflow-hidden">
                    <div className="h-2 bg-blue-600" style={{ width: `${Math.round((p.quantidade / (cards?.total || 1)) * 100)}%` }} />
                  </div>
                  <div className="w-10 text-right font-semibold">{p.quantidade}</div>
                </div>
              ))}
              {!porTipo.length ? <div className="text-sm text-slate-500 dark:text-slate-300">Sem dados.</div> : null}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
