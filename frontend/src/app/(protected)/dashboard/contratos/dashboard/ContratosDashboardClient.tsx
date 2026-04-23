"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
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
  bg: "#f7f8fa",
  border: "#e5e7eb",
};

function moeda(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function pct(v: number | null | undefined) {
  if (v == null || !Number.isFinite(v)) return "—";
  return `${Number(v).toFixed(1)}%`;
}

function severidadeUi(s: DashboardAlerta["severidade"]) {
  if (s === "CRITICO") return { icon: "🔴", className: "text-red-700" };
  return { icon: "🟡", className: "text-amber-700" };
}

function iconBoxStyle(color: string) {
  return { backgroundColor: color };
}

export default function ContratosDashboardClient() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [papel, setPapel] = useState("");
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
    if (papel) p.set("papel", papel);
    const s = p.toString();
    return s ? `?${s}` : "";
  }, [status, papel]);

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

  function abrirContrato(contratoId: number) {
    const id = Number(contratoId);
    if (!Number.isFinite(id) || id <= 0) return;
    router.push(`/dashboard/contratos?id=${id}`);
  }

  function abrirPorAlerta(a: DashboardAlerta) {
    const codigo = String(a.codigo || "").toUpperCase();
    if (codigo === "CONTRATOS_VENCIDOS") return router.push("/dashboard/contratos?status=VENCIDO");
    if (codigo === "CONTRATOS_A_VENCER") return router.push("/dashboard/contratos?status=A_VENCER");
    if (codigo === "SEM_RECURSOS") return router.push("/dashboard/contratos?status=SEM_RECURSOS");
    if (codigo === "ADITIVOS_PENDENTES") return router.push("/dashboard/contratos/aditivos");
    return router.push("/dashboard/contratos");
  }

  function situacaoUi(s: PrazoCriticoRow["situacao"]) {
    if (s === "VENCIDO") return { color: "#EF4444", label: "Vencido" };
    if (s === "A_VENCER") return { color: "#F59E0B", label: "A vencer" };
    return { color: "#16A34A", label: "Em andamento" };
  }

  return (
    <div className="space-y-6 text-[#111827]">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">Dashboard de Contratos</h1>
          <div className="text-sm text-[#6B7280]">Visão geral da gestão dos contratos.</div>
        </div>

        <div className="flex items-end gap-2 flex-wrap">
          <div>
            <div className="text-xs text-[#6B7280]">Período</div>
            <input className="input w-[140px]" type="month" value={periodo} onChange={(e) => setPeriodo(e.target.value)} />
          </div>
          <div>
            <div className="text-xs text-[#6B7280]">Natureza</div>
            <select className="input w-[190px]" value={papel} onChange={(e) => setPapel(e.target.value)}>
              <option value="">Todos</option>
              <option value="CONTRATADO">Receita (somos contratados)</option>
              <option value="CONTRATANTE">Despesa (somos contratantes)</option>
            </select>
          </div>
          <div>
            <div className="text-xs text-[#6B7280]">Status</div>
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
          <button
            className="rounded-lg border border-[#D1D5DB] bg-white px-4 py-2 text-sm text-[#111827] hover:bg-[#F9FAFB]"
            type="button"
            onClick={carregar}
            disabled={loading}
          >
            {loading ? "Atualizando..." : "Atualizar"}
          </button>
        </div>
      </div>

      {err ? <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div> : null}

      <section className="grid grid-cols-1 gap-4 md:grid-cols-6">
        <div className="rounded-xl border border-[#E5E7EB] bg-white p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl" style={iconBoxStyle(DASH_COLORS.primary)} />
            <div className="min-w-0">
              <div className="text-xs text-[#6B7280]">Total de contratos</div>
              <div className="text-2xl font-semibold">{cards?.total ?? kpis?.totalContratos ?? 0}</div>
            </div>
          </div>
        </div>
        <div className="rounded-xl border border-[#E5E7EB] bg-white p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl" style={iconBoxStyle(DASH_COLORS.green)} />
            <div className="min-w-0">
              <div className="text-xs text-[#6B7280]">Em andamento</div>
              <div className="text-2xl font-semibold">{cards?.emAndamento ?? 0}</div>
              <div className="text-xs text-[#6B7280]">{(((cards?.emAndamento ?? 0) / situacaoTotal) * 100).toFixed(1)}% do total</div>
            </div>
          </div>
        </div>
        <div className="rounded-xl border border-[#E5E7EB] bg-white p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl" style={iconBoxStyle(DASH_COLORS.amber)} />
            <div className="min-w-0">
              <div className="text-xs text-[#6B7280]">A vencer (≤ 30 dias)</div>
              <div className="text-2xl font-semibold">{cards?.aVencer ?? kpis?.vencendoEm30Dias ?? 0}</div>
            </div>
          </div>
        </div>
        <div className="rounded-xl border border-[#E5E7EB] bg-white p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl" style={iconBoxStyle(DASH_COLORS.red)} />
            <div className="min-w-0">
              <div className="text-xs text-[#6B7280]">Vencidos</div>
              <div className="text-2xl font-semibold">{cards?.vencidos ?? kpis?.atrasados ?? 0}</div>
            </div>
          </div>
        </div>
        <div className="rounded-xl border border-[#E5E7EB] bg-white p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl" style={iconBoxStyle(DASH_COLORS.purple)} />
            <div className="min-w-0">
              <div className="text-xs text-[#6B7280]">Concluídos</div>
              <div className="text-2xl font-semibold">{cards?.concluidos ?? 0}</div>
            </div>
          </div>
        </div>
        <div className="rounded-xl border border-[#E5E7EB] bg-white p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl" style={iconBoxStyle(DASH_COLORS.slate)} />
            <div className="min-w-0">
              <div className="text-xs text-[#6B7280]">Sem recursos</div>
              <div className="text-2xl font-semibold">{cards?.semRecursos ?? 0}</div>
            </div>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="rounded-xl border border-[#E5E7EB] bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className="text-sm font-semibold">Situação dos contratos</div>
            <div className="text-xs text-[#6B7280]">Total: {cards?.total ?? 0}</div>
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
                    <span className="text-[#111827]">{p.label}</span>
                  </div>
                  <div className="font-semibold">{p.value}</div>
                </div>
              ))}
              {!donutParts.stops.length ? <div className="text-[#6B7280]">Sem dados.</div> : null}
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-[#E5E7EB] bg-white p-4 shadow-sm lg:col-span-1">
          <div className="text-sm font-semibold">Valor contratado x executado</div>
          <div className="mt-1 text-xs text-[#6B7280]">Últimos 6 meses</div>

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
                  <div className="text-[11px] text-[#6B7280]">{p.mes.slice(5)}</div>
                </div>
              );
            })}
            {!serie.length ? <div className="text-sm text-[#6B7280]">Sem série.</div> : null}
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
            <div className="flex items-center gap-2">
              <span className="inline-block h-2.5 w-2.5 rounded" style={{ background: `${DASH_COLORS.primary}B3` }} />
              <span className="text-[#6B7280]">Contratado</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-block h-2.5 w-2.5 rounded" style={{ background: `${DASH_COLORS.green}B3` }} />
              <span className="text-[#6B7280]">Executado</span>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-lg border border-[#E5E7EB] bg-[#F9FAFB] p-3">
              <div className="text-xs text-[#6B7280]">Valor contratado</div>
              <div className="font-semibold">{moeda(kpis?.valorContratado ?? 0)}</div>
            </div>
            <div className="rounded-lg border border-[#E5E7EB] bg-[#F9FAFB] p-3">
              <div className="text-xs text-[#6B7280]">Valor executado</div>
              <div className="font-semibold">{moeda(kpis?.valorExecutado ?? 0)}</div>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-[#E5E7EB] bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <div className="text-sm font-semibold">Alertas</div>
          </div>
          <div className="mt-3 space-y-2">
            {alertas.map((a) => (
              <div key={a.codigo} className="rounded-lg border border-[#E5E7EB] bg-[#F9FAFB] p-3 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <div className={`flex items-center gap-2 font-semibold ${severidadeUi(a.severidade).className}`}>
                    <span>{severidadeUi(a.severidade).icon}</span>
                    <button type="button" className="text-red-500 hover:underline" onClick={() => abrirPorAlerta(a)}>
                      {a.titulo}
                    </button>
                  </div>
                  <div className="font-semibold">{a.quantidade}</div>
                </div>
              </div>
            ))}
            {!alertas.length ? <div className="text-sm text-[#6B7280]">Sem alertas.</div> : null}
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-4">
        <div className="rounded-xl border border-[#E5E7EB] bg-white p-4 shadow-sm">
          <div className="text-sm font-semibold">Medições</div>
          <div className="mt-2 text-xs text-[#6B7280]">Total medido</div>
          <div className="text-xl font-semibold">{moeda(kpis?.valorExecutado ?? 0)}</div>
          <div className="mt-2 text-xs text-[#6B7280]">{pct(kpis?.percentualExecucaoFinanceira)}</div>
        </div>
        <div className="rounded-xl border border-[#E5E7EB] bg-white p-4 shadow-sm">
          <div className="text-sm font-semibold">Pagamentos</div>
          <div className="mt-2 text-xs text-[#6B7280]">Total pago</div>
          <div className="text-xl font-semibold">{moeda(kpis?.valorPago ?? 0)}</div>
          <div className="mt-2 text-xs text-[#6B7280]">Saldo a receber: {moeda(kpis?.saldoAReceber ?? 0)}</div>
        </div>
        <div className="rounded-xl border border-[#E5E7EB] bg-white p-4 shadow-sm">
          <div className="text-sm font-semibold">Execução financeira (média)</div>
          <div className="mt-3 flex items-center gap-4">
            <div className="h-20 w-20 rounded-full border border-[#E5E7EB] bg-[#F9FAFB] flex items-center justify-center text-lg font-semibold">
              {pct(kpis?.percentualExecucaoFinanceira)}
            </div>
            <div className="text-sm text-[#6B7280]">
              <div>Executado: {moeda(kpis?.valorExecutado ?? 0)}</div>
              <div>Contratado: {moeda(kpis?.valorContratado ?? 0)}</div>
            </div>
          </div>
        </div>
        <div className="rounded-xl border border-[#E5E7EB] bg-white p-4 shadow-sm">
          <div className="text-sm font-semibold">Aditivos por situação</div>
          <div className="mt-3 space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <div className="text-[#6B7280]">Aprovados</div>
              <div className="font-semibold">{aditivosPorSituacao?.aprovados ?? 0}</div>
            </div>
            <div className="flex items-center justify-between">
              <div className="text-[#6B7280]">Pendentes</div>
              <div className="font-semibold">{aditivosPorSituacao?.pendentes ?? 0}</div>
            </div>
            <div className="flex items-center justify-between">
              <div className="text-[#6B7280]">Cancelados</div>
              <div className="font-semibold">{aditivosPorSituacao?.cancelados ?? 0}</div>
            </div>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="rounded-xl border border-[#E5E7EB] bg-white p-4 shadow-sm xl:col-span-2">
          <div className="text-sm font-semibold">Contratos com prazo crítico</div>
          <div className="mt-3 overflow-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-[#F9FAFB] text-left text-[#111827]">
                <tr>
                  <th className="px-3 py-2">Contrato</th>
                  <th className="px-3 py-2">Objeto</th>
                  <th className="px-3 py-2">Vigência</th>
                  <th className="px-3 py-2 text-right">Dias</th>
                  <th className="px-3 py-2">Situação</th>
                </tr>
              </thead>
              <tbody className="text-[#111827]">
                {prazoCritico.map((r) => (
                  <tr key={r.contratoId} className="border-t border-[#E5E7EB]">
                    <td className="px-3 py-2 font-semibold">
                      <button type="button" className="text-[#111827] hover:underline" onClick={() => abrirContrato(r.contratoId)}>
                        {r.numeroContrato}
                      </button>
                    </td>
                    <td className="px-3 py-2">
                      <button type="button" className="text-[#111827] hover:underline" onClick={() => abrirContrato(r.contratoId)}>
                        {r.objeto || "—"}
                      </button>
                    </td>
                    <td className="px-3 py-2">{new Date(r.vigenciaAtual).toLocaleDateString("pt-BR")}</td>
                    <td className={`px-3 py-2 text-right ${r.diasRestantes < 0 ? "text-red-700" : r.diasRestantes <= 30 ? "text-amber-700" : ""}`}>{r.diasRestantes}</td>
                    <td className="px-3 py-2">
                      <span className="inline-flex items-center gap-2">
                        <span className="inline-block h-2 w-2 rounded-full" style={{ background: situacaoUi(r.situacao).color }} />
                        <span>{situacaoUi(r.situacao).label}</span>
                      </span>
                    </td>
                  </tr>
                ))}
                {!prazoCritico.length ? (
                  <tr>
                    <td colSpan={5} className="px-3 py-6 text-center text-[#6B7280]">
                      Sem contratos críticos.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-xl border border-[#E5E7EB] bg-white p-4 shadow-sm">
            <div className="text-sm font-semibold">Atividades recentes</div>
            <div className="mt-3 space-y-2 text-sm">
              {atividades.map((a) => (
                <div key={a.id} className="rounded-lg border border-[#E5E7EB] bg-[#F9FAFB] p-3">
                  <div className="font-semibold">{a.descricao}</div>
                  <div className="mt-1 text-xs text-[#6B7280]">
                    {a.numeroContrato ? `${a.numeroContrato} • ` : ""}
                    {new Date(a.criadoEm).toLocaleString("pt-BR")}
                  </div>
                </div>
              ))}
              {!atividades.length ? <div className="text-sm text-[#6B7280]">Sem atividades.</div> : null}
            </div>
          </div>

          <div className="rounded-xl border border-[#E5E7EB] bg-white p-4 shadow-sm">
            <div className="text-sm font-semibold">Contratos por tipo</div>
            <div className="mt-3 space-y-2 text-sm">
              {porTipo.map((p) => (
                <div key={p.tipo} className="flex items-center gap-3">
                  <div className="w-16 text-[#6B7280]">{p.tipo}</div>
                  <div className="flex-1 h-2 rounded bg-[#E5E7EB] overflow-hidden">
                    <div className="h-2 bg-[#2563EB]" style={{ width: `${Math.round((p.quantidade / (cards?.total || 1)) * 100)}%` }} />
                  </div>
                  <div className="w-10 text-right font-semibold">{p.quantidade}</div>
                </div>
              ))}
              {!porTipo.length ? <div className="text-sm text-[#6B7280]">Sem dados.</div> : null}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
