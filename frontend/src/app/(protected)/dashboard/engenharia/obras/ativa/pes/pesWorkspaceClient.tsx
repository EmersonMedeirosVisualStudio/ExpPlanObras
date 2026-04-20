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

type GanttCc = {
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
  id: string | number;
  nome: string;
  criadoEm: string;
  semanaInicio: string;
  gantt: NonNullable<DashboardPesData["gantt"]>;
  metrics: { prazo: number; custo: number; score: number };
};

type InsumoExtra = {
  id: number;
  semanaInicio: string;
  codigoServico: string;
  codigoCentroCusto: string | null;
  codigoInsumo: string | null;
  itemDescricao: string;
  unidadeMedida: string | null;
  deltaQuantidade: number;
  observacao: string | null;
  criadoEm: string;
};

type KanbanItem = {
  id: number;
  status: string;
  tipo: string;
  codigo: string;
  nome: string;
  cc: string | null;
  servico: string | null;
  quantidade: number;
  unidade: string | null;
  prioridade: string;
  prazo: string | null;
  custo: number;
  fornecedor: string | null;
  responsavel: string | null;
  avaliacaoTexto: string | null;
  devolvido: boolean;
  solicitarNovamente: boolean;
  idSolicitacaoAquisicao: number | null;
  criadoEm: string;
  atualizadoEm?: string;
  slaHoras?: number;
  slaLimiteHoras?: number | null;
  slaAtrasado?: boolean;
  validacao?: { saldo: number | null; reservas: number | null; requisicoes: number | null; disponivel: number | null };
  transferencia?: {
    origemTipoLocal: string | null;
    origemIdLocal: number | null;
    destinoTipoLocal: string | null;
    destinoIdLocal: number | null;
    freteInterno: number | null;
  };
  naturezaCusto?: "MAO" | "FERRAMENTA" | "EQUIPAMENTO" | "MATERIAL" | null;
};

function calcPrazo(ccs: GanttCc[]) {
  return ccs.reduce((m, c) => Math.max(m, c.fim), 0);
}

function calcCusto(ccs: GanttCc[]) {
  const rates: Record<string, number> = { MO_TOTAL: 90, EQ_GERAL: 140, INS_GERAL: 18 };
  function rateOf(tipo: string) {
    const t = String(tipo || "").toUpperCase();
    if (rates[t] != null) return rates[t];
    if (t.startsWith("MO_")) return 90;
    if (t.startsWith("EQ_")) return 140;
    if (t.startsWith("INS_")) return 18;
    return 0;
  }
  let total = 0;
  for (const cc of ccs) {
    const horas = (cc.fim - cc.inicio) * 8;
    for (const r of cc.recursos.mo) total += rateOf(r.tipo) * (r.qtd || 0) * horas;
    for (const r of cc.recursos.eq) total += rateOf(r.tipo) * (r.qtd || 0) * horas;
    for (const r of cc.recursos.ins) total += rateOf(r.tipo) * (r.qtd || 0) * horas;
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
  const partePct = cc.pctParteServico == null ? null : Math.round(cc.pctParteServico * 100);
  const contratoPct = cc.pctParteContrato == null ? null : Math.round(cc.pctParteContrato * 100);

  return (
    <div className="absolute top-1.5 h-8 rounded-lg border text-xs cursor-move select-none touch-none" style={{ left, width }}>
      <div className={`absolute inset-0 rounded-lg border ${baseClass}`} />
      <div className={`absolute left-0 top-0 h-full rounded-l-lg ${cc.conflito ? "bg-red-500" : "bg-emerald-500"}`} style={{ width: progressWidth }} />
      <div className="absolute inset-0 flex items-center justify-between px-2 text-slate-800">
        <span className="font-semibold">{cc.cc}</span>
        <span className="flex items-center gap-2">
          {contratoPct == null ? null : <span className="text-[10px] text-slate-600">C{contratoPct}%</span>}
          {partePct == null ? null : <span className="text-[10px] text-slate-600">S{partePct}%</span>}
          <span>{Math.round((cc.progresso || 0) * 100)}%</span>
        </span>
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
  const [tab, setTab] = useState<"DASH" | "PLANEJAMENTO" | "GANTT" | "RECURSOS" | "KANBAN" | "ALERTAS" | "CENARIOS" | "OTIMIZACAO">("DASH");
  const [semanaBase, setSemanaBase] = useState(() => startOfWeekMonday(new Date().toISOString().slice(0, 10)));
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [data, setData] = useState<DashboardPesData | null>(null);
  const [replanejando, setReplanejando] = useState(false);
  const [drag, setDrag] = useState<null | { id: string; startX: number; startInicio: number; dur: number }>(null);
  const [pesoPrazo, setPesoPrazo] = useState(1000);
  const [iter, setIter] = useState(120);
  const [otimizando, setOtimizando] = useState(false);
  const [optResult, setOptResult] = useState<any>(null);
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [insumosExtras, setInsumosExtras] = useState<InsumoExtra[]>([]);
  const [insumoExtraCcId, setInsumoExtraCcId] = useState<string>("");
  const [insumoExtraCodigo, setInsumoExtraCodigo] = useState("");
  const [insumoExtraSelecionado, setInsumoExtraSelecionado] = useState<{ codigo: string; descricao: string; unidade: string | null } | null>(null);
  const [insumoSugestoes, setInsumoSugestoes] = useState<Array<{ codigo: string; descricao: string; unidade: string | null }>>([]);
  const [insumoExtraDelta, setInsumoExtraDelta] = useState("");
  const [insumoExtraObs, setInsumoExtraObs] = useState("");
  const [salvandoInsumoExtra, setSalvandoInsumoExtra] = useState(false);
  const [kanbanColumns, setKanbanColumns] = useState<string[]>([]);
  const [kanbanData, setKanbanData] = useState<Record<string, KanbanItem[]>>({});
  const [kanbanNaoAprovados, setKanbanNaoAprovados] = useState<KanbanItem[]>([]);
  const [kanbanLoading, setKanbanLoading] = useState(false);
  const [dragKanban, setDragKanban] = useState<{ itemId: number; fromStatus: string } | null>(null);
  const [selectedKanban, setSelectedKanban] = useState<KanbanItem | null>(null);
  const [avaliacaoKanban, setAvaliacaoKanban] = useState("");
  const [devolverKanban, setDevolverKanban] = useState(false);
  const [solicitarNovamenteKanban, setSolicitarNovamenteKanban] = useState(true);
  const [destinoTipoLocalKanban, setDestinoTipoLocalKanban] = useState<"ALMOXARIFADO" | "UNIDADE" | "OBRA">("UNIDADE");
  const [destinoIdLocalKanban, setDestinoIdLocalKanban] = useState("");
  const [freteInternoKanban, setFreteInternoKanban] = useState("");
  const [naturezaCustoKanban, setNaturezaCustoKanban] = useState<"MAO" | "FERRAMENTA" | "EQUIPAMENTO" | "MATERIAL">("MATERIAL");
  const [quantidadeConsumidaKanban, setQuantidadeConsumidaKanban] = useState("");
  const [custoUnitarioConsumidoKanban, setCustoUnitarioConsumidoKanban] = useState("");

  const semanaInicio = useMemo(() => startOfWeekMonday(semanaBase), [semanaBase]);
  const semanaFim = useMemo(() => addDays(semanaInicio, 6), [semanaInicio]);

  async function carregarCenarios() {
    try {
      const res = await fetch(`/api/v1/pes/cenarios?idObra=${idObra}`);
      const json = await res.json().catch(() => null);
      if (res.ok && json?.success) {
        setScenarios(
          json.data.map((dbCenario: any) => ({
            id: dbCenario.id,
            nome: dbCenario.nome,
            criadoEm: new Date(dbCenario.createdAt).toLocaleString('pt-BR'),
            semanaInicio: dbCenario.dados?.semanaInicio || '',
            gantt: dbCenario.dados?.gantt,
            metrics: dbCenario.dados?.metrics || { prazo: 0, custo: 0, score: 0 }
          }))
        );
      }
    } catch (e) {
      console.error('Erro ao carregar cenários', e);
    }
  }

  useEffect(() => {
    carregarCenarios();
  }, [idObra]);

  async function carregarInsumosExtras() {
    try {
      const res = await fetch(`/api/v1/pes/insumos-extras?idObra=${idObra}&semanaInicio=${semanaInicio}`, { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (res.ok && json?.success) {
        setInsumosExtras(Array.isArray(json.data) ? (json.data as InsumoExtra[]) : []);
      } else {
        setInsumosExtras([]);
      }
    } catch {
      setInsumosExtras([]);
    }
  }

  async function carregarKanban() {
    try {
      setKanbanLoading(true);
      const res = await fetch(`/api/v1/pes/kanban?idObra=${idObra}&semanaInicio=${semanaInicio}`, { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.message || "Erro ao carregar kanban");
      setKanbanColumns(Array.isArray(json.data?.columns) ? json.data.columns : []);
      setKanbanData((json.data?.dataByStatus || {}) as Record<string, KanbanItem[]>);
      setKanbanNaoAprovados(Array.isArray(json.data?.naoAprovados) ? (json.data.naoAprovados as KanbanItem[]) : []);
    } catch (e: any) {
      setErr(e?.message || "Erro ao carregar kanban");
      setKanbanColumns([]);
      setKanbanData({});
      setKanbanNaoAprovados([]);
    } finally {
      setKanbanLoading(false);
    }
  }

  useEffect(() => {
    const q = insumoExtraCodigo.trim();
    if (!q) {
      setInsumoSugestoes([]);
      setInsumoExtraSelecionado(null);
      return;
    }

    const t = window.setTimeout(async () => {
      try {
        const res = await fetch(`/api/v1/engenharia/insumos?q=${encodeURIComponent(q)}&limit=10`, { cache: "no-store" });
        const json = await res.json().catch(() => null);
        const sugestoes = res.ok && json?.success && Array.isArray(json.data) ? (json.data as any[]) : [];
        const mapped = sugestoes.map((s) => ({
          codigo: String(s.codigo),
          descricao: String(s.descricao),
          unidade: s.unidade ? String(s.unidade) : null,
        }));
        setInsumoSugestoes(mapped);
        const exact = mapped.find((x) => x.codigo.toUpperCase() === q.toUpperCase());
        setInsumoExtraSelecionado(exact ? { codigo: exact.codigo, descricao: exact.descricao, unidade: exact.unidade } : null);
      } catch {
        setInsumoSugestoes([]);
        setInsumoExtraSelecionado(null);
      }
    }, 250);

    return () => window.clearTimeout(t);
  }, [insumoExtraCodigo]);

  async function removerCenario(id: string | number) {
    try {
      const res = await fetch(`/api/v1/pes/cenarios/${id}`, { method: 'DELETE' });
      if (res.ok) {
        await carregarCenarios();
      }
    } catch (e) {
      console.error('Erro ao remover cenário', e);
    }
  }

  async function salvarCenario(newScenario: Omit<Scenario, 'id' | 'criadoEm'>) {
    try {
      const payload = {
        idObra,
        nome: newScenario.nome,
        tipo: 'MANUAL',
        dados: {
          semanaInicio: newScenario.semanaInicio,
          gantt: newScenario.gantt,
          metrics: newScenario.metrics
        }
      };
      const res = await fetch('/api/v1/pes/cenarios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        await carregarCenarios();
      }
    } catch (e) {
      console.error('Erro ao salvar cenário', e);
    }
  }

  async function salvarInsumoExtra() {
    if (!insumoExtraCcId) return;
    const cc = data?.gantt?.ccs?.find((c) => c.id === insumoExtraCcId);
    if (!cc) return;

    const delta = Number(String(insumoExtraDelta || '').replace(',', '.'));
    if (!Number.isFinite(delta) || delta === 0) return;

    const codigoInsumo = insumoExtraCodigo.trim();
    if (!codigoInsumo) return;

    try {
      setSalvandoInsumoExtra(true);
      const payload = {
        idObra,
        semanaInicio,
        codigoServico: cc.servico,
        codigoCentroCusto: cc.cc,
        codigoInsumo,
        deltaQuantidade: delta,
        observacao: insumoExtraObs.trim() || null,
      };
      const res = await fetch('/api/v1/pes/insumos-extras', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.message || 'Erro ao salvar insumo extra');
      setInsumoExtraCodigo('');
      setInsumoExtraSelecionado(null);
      setInsumoSugestoes([]);
      setInsumoExtraDelta('');
      setInsumoExtraObs('');
      await carregarInsumosExtras();
      await carregarKanban();
      await carregar();
    } catch (e: any) {
      setErr(e?.message || 'Erro ao salvar insumo extra');
    } finally {
      setSalvandoInsumoExtra(false);
    }
  }

  async function removerInsumoExtra(id: number) {
    try {
      const res = await fetch(`/api/v1/pes/insumos-extras/${id}`, { method: 'DELETE' });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.message || 'Erro ao remover insumo extra');
      await carregarInsumosExtras();
      await carregarKanban();
      await carregar();
    } catch (e: any) {
      setErr(e?.message || 'Erro ao remover insumo extra');
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
    carregarInsumosExtras();
    carregarKanban();
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

  useEffect(() => {
    if (!drag) return;
    const onMove = (ev: PointerEvent) => {
      if (!drag) return;
      const dx = ev.clientX - drag.startX;
      const delta = Math.round(dx / GANTT_SCALE);
      const novoInicio = Math.max(0, drag.startInicio + delta);
      setData((prev) => {
        if (!prev?.gantt?.ccs?.length) return prev;
        const ccs = prev.gantt.ccs.map((c) => (c.id === drag.id ? { ...c, inicio: novoInicio, fim: novoInicio + drag.dur } : c));
        return { ...prev, gantt: { ...prev.gantt, ccs } };
      });
    };
    const onUp = async (ev: PointerEvent) => {
      if (!drag) return;
      const dx = ev.clientX - drag.startX;
      const delta = Math.round(dx / GANTT_SCALE);
      setDrag(null);
      if (delta !== 0) await moverCcDias(drag.id, delta);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp, { once: true });
    return () => {
      window.removeEventListener("pointermove", onMove);
    };
  }, [drag]);

  function iniciarDrag(cc: GanttCc, ev: React.PointerEvent) {
    if (replanejando) return;
    ev.preventDefault();
    ev.stopPropagation();
    const dur = cc.fim - cc.inicio;
    setDrag({ id: cc.id, startX: ev.clientX, startInicio: cc.inicio, dur });
  }

  function salvarCenarioAtual() {
    if (!data?.gantt?.ccs?.length) return;
    const prazo = calcPrazo(data.gantt.ccs);
    const custo = calcCusto(data.gantt.ccs);
    const score = calcScore(data.gantt.ccs, pesoPrazo);
    const scn = {
      nome: `Cenário ${scenarios.length + 1}`,
      semanaInicio,
      gantt: data.gantt,
      metrics: { prazo, custo, score },
    };
    salvarCenario(scn);
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

  async function moverKanban(item: KanbanItem, paraStatus: string, extra?: Record<string, any>) {
    if (!item || item.status === paraStatus) return;
    try {
      setErr(null);
      const res = await fetch(`/api/v1/pes/kanban/${item.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: paraStatus, ...(extra || {}) }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.message || "Transição inválida");
      await carregarKanban();
    } catch (e: any) {
      setErr(e?.message || "Falha ao mover card no Kanban");
    } finally {
      setDragKanban(null);
    }
  }

  async function avaliarKanban(acao: "AVALIAR" | "DEVOLVER") {
    if (!selectedKanban) return;
    try {
      const status = acao === "DEVOLVER" ? "DEVOLVIDO" : "AVALIACAO";
      const res = await fetch(`/api/v1/pes/kanban/${selectedKanban.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status,
          avaliacaoTexto: avaliacaoKanban || null,
          devolver: acao === "DEVOLVER",
          solicitarNovamente: solicitarNovamenteKanban,
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.message || "Falha na avaliação");
      setSelectedKanban(null);
      setAvaliacaoKanban("");
      setDevolverKanban(false);
      setSolicitarNovamenteKanban(true);
      await carregarKanban();
    } catch (e: any) {
      setErr(e?.message || "Falha ao avaliar/devolver item");
    }
  }

  function statusBg(status: string) {
    const s = String(status || "").toUpperCase();
    if (s === "SOLICITADO") return "bg-blue-50";
    if (s === "VALIDACAO") return "bg-yellow-50";
    if (s === "RESERVADO") return "bg-purple-50";
    if (s === "ENTREGA" || s === "TRANSPORTE_FORNECEDOR") return "bg-orange-50";
    if (s === "DISPONIVEL" || s === "RECEBIDO") return "bg-emerald-50";
    if (s === "CONSUMIDO") return "bg-slate-100";
    if (s === "DEVOLVIDO") return "bg-red-50";
    return "bg-white";
  }

  const kpis = data?.kpis;
  const custoRealTotal = Number(((data as any)?.custoReal?.total ?? 0) || 0);
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
          <SidebarItem active={tab === "KANBAN"} label="Kanban Insumos" onClick={() => setTab("KANBAN")} />
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
          <button
            className="mt-3 w-full rounded-lg bg-white px-3 py-2 text-sm font-semibold text-slate-900 disabled:opacity-50"
            type="button"
            onClick={() => {
              carregar();
              carregarInsumosExtras();
              carregarKanban();
            }}
            disabled={loading}
          >
            {loading ? "Atualizando..." : "Atualizar"}
          </button>
        </div>

        <div className="mt-4 space-y-2">
          <button className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white hover:bg-slate-900 disabled:opacity-50" type="button" onClick={autoReplanejar} disabled={replanejando}>
            {replanejando ? "Replanejando..." : "Auto-replanejar"}
          </button>
          <button className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white hover:bg-slate-900 disabled:opacity-50" type="button" onClick={salvarCenarioAtual} disabled={!data?.gantt?.ccs?.length}>
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
            <section className="col-span-12 grid grid-cols-1 gap-4 md:grid-cols-5">
              <KpiCard titulo="Execução Física" valor={pct(kpis?.execucaoFisica ?? null)} valorClass={execColor} subtitulo="executado acumulado / planejado acumulado" />
              <KpiCard titulo="Prazo (dias)" valor={kpis?.prazoDias == null ? "—" : String(kpis.prazoDias)} valorClass="text-slate-500" subtitulo="caminho crítico (engine)" />
              <KpiCard titulo="Custo (var.)" valor={kpis?.custoVariacaoPct == null ? "—" : pct(kpis.custoVariacaoPct)} valorClass="text-slate-500" subtitulo="quando disponível" />
              <KpiCard titulo="Produtividade" valor={kpis?.produtividade == null ? "—" : String(kpis.produtividade.toFixed(2))} valorClass={prodColor} subtitulo="produção real / horas reais" />
              <KpiCard titulo="Custo Real Utilizado" valor={`R$ ${custoRealTotal.toFixed(2)}`} valorClass="text-slate-800" subtitulo="consumo real (MO+FERR+EQP+MATERIAL)" />
            </section>

            <section className="col-span-12 rounded-xl border bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-center justify-between gap-2 flex-wrap">
                <div className="text-sm font-semibold">DRE da Obra (Custo Real por Natureza)</div>
                <button
                  className="rounded-lg border bg-white px-3 py-2 text-sm hover:bg-slate-50"
                  type="button"
                  onClick={() => {
                    const url = `/api/v1/pes/dashboard?idObra=${idObra}&semanaInicio=${semanaInicio}&export=custo-real-csv`;
                    window.location.href = url;
                  }}
                >
                  Exportar CSV
                </button>
              </div>
              <div className="grid grid-cols-1 gap-2 md:grid-cols-4">
                <div className="rounded border bg-slate-50 p-2 text-sm">Mão de Obra: <span className="font-semibold">R$ {Number(((data as any)?.custoReal?.porNatureza?.MAO ?? 0)).toFixed(2)}</span></div>
                <div className="rounded border bg-slate-50 p-2 text-sm">Ferramenta: <span className="font-semibold">R$ {Number(((data as any)?.custoReal?.porNatureza?.FERRAMENTA ?? 0)).toFixed(2)}</span></div>
                <div className="rounded border bg-slate-50 p-2 text-sm">Equipamento: <span className="font-semibold">R$ {Number(((data as any)?.custoReal?.porNatureza?.EQUIPAMENTO ?? 0)).toFixed(2)}</span></div>
                <div className="rounded border bg-slate-50 p-2 text-sm">Material: <span className="font-semibold">R$ {Number(((data as any)?.custoReal?.porNatureza?.MATERIAL ?? 0)).toFixed(2)}</span></div>
              </div>
            </section>

            <section className="col-span-12 rounded-xl border bg-white p-4 shadow-sm">
              <div className="text-sm font-semibold">Detalhamento (CC / Serviço / Natureza)</div>
              <div className="mt-3 overflow-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50 text-left text-slate-700">
                    <tr>
                      <th className="px-3 py-2">CC</th>
                      <th className="px-3 py-2">Serviço</th>
                      <th className="px-3 py-2">Natureza</th>
                      <th className="px-3 py-2 text-right">Custo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(((data as any)?.custoReal?.porCc || []) as any[]).map((r, idx) => (
                      <tr key={`${r.cc}-${r.servico}-${r.natureza}-${idx}`} className="border-t">
                        <td className="px-3 py-2">{r.cc}</td>
                        <td className="px-3 py-2">{r.servico || "—"}</td>
                        <td className="px-3 py-2">{r.natureza}</td>
                        <td className="px-3 py-2 text-right font-semibold">R$ {Number(r.custoReal || 0).toFixed(2)}</td>
                      </tr>
                    ))}
                    {!(((data as any)?.custoReal?.porCc || []) as any[]).length ? (
                      <tr>
                        <td colSpan={4} className="px-3 py-6 text-center text-slate-500">
                          Sem apropriações registradas nesta semana.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
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
                        <div className="text-xs text-slate-500">
                          {cc.critico ? "Crítico" : "Não crítico"}
                          {cc.conflito ? " • Conflito" : ""}
                          {cc.pctParteServico == null ? "" : ` • Semana: ${Math.round(cc.pctParteServico * 100)}%`}
                          {cc.pctParteContrato == null ? "" : ` • Contrato: ${Math.round(cc.pctParteContrato * 100)}%`}
                        </div>
                      </div>
                      <div className="relative flex-1 border-b border-slate-200">
                        <div onPointerDown={(ev) => iniciarDrag(cc, ev)} className="relative h-11">
                          <GanttBar cc={cc} />
                        </div>
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

            <div className="mt-4 rounded-lg border bg-white p-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div>
                  <div className="text-sm font-semibold">Insumos extras (por CC)</div>
                  <div className="text-xs text-slate-500">Use quantidade positiva para acréscimo e negativa para decréscimo. O motivo fica registrado na observação.</div>
                </div>
                <button className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white disabled:opacity-50" type="button" onClick={salvarInsumoExtra} disabled={salvandoInsumoExtra || !insumoExtraCcId}>
                  {salvandoInsumoExtra ? "Salvando..." : "Adicionar"}
                </button>
              </div>

              <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-4">
                <div className="md:col-span-2">
                  <div className="text-xs text-slate-600">Centro de custo</div>
                  <select className="mt-1 w-full rounded-lg border px-3 py-2 text-sm" value={insumoExtraCcId} onChange={(e) => setInsumoExtraCcId(e.target.value)}>
                    <option value="">Selecione</option>
                    {(data?.gantt?.ccs || []).map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.cc} • {c.servico}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <div className="text-xs text-slate-600">Código do insumo (catálogo)</div>
                  <input
                    className="input mt-1"
                    value={insumoExtraCodigo}
                    onChange={(e) => setInsumoExtraCodigo(e.target.value)}
                    placeholder="Ex: INS-000123"
                    list="pes-insumos-sugestoes"
                  />
                  <datalist id="pes-insumos-sugestoes">
                    {insumoSugestoes.map((s) => (
                      <option key={s.codigo} value={s.codigo}>
                        {s.descricao}
                      </option>
                    ))}
                  </datalist>
                  <div className="mt-1 text-[11px] text-slate-500">
                    {insumoExtraSelecionado ? `${insumoExtraSelecionado.descricao} • ${insumoExtraSelecionado.unidade || '—'}` : 'Digite para buscar no catálogo de Insumos.'}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-slate-600">Δ Quantidade</div>
                  <input className="input mt-1" value={insumoExtraDelta} onChange={(e) => setInsumoExtraDelta(e.target.value)} placeholder="Ex: 10 ou -5" />
                </div>
              </div>

              <div className="mt-3">
                <div className="text-xs text-slate-600">Observação (motivo)</div>
                <input className="input mt-1" value={insumoExtraObs} onChange={(e) => setInsumoExtraObs(e.target.value)} placeholder="Ex: Ajuste por quebra/perda; troca de traço; alteração de frente" />
              </div>

              <div className="mt-4 overflow-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50 text-left text-slate-700">
                    <tr>
                      <th className="px-3 py-2">Serviço</th>
                      <th className="px-3 py-2">CC</th>
                      <th className="px-3 py-2">Código</th>
                      <th className="px-3 py-2">Insumo</th>
                      <th className="px-3 py-2 text-right">Δ</th>
                      <th className="px-3 py-2">Obs.</th>
                      <th className="px-3 py-2">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {insumosExtras.map((it) => (
                      <tr key={it.id} className="border-t">
                        <td className="px-3 py-2">{it.codigoServico}</td>
                        <td className="px-3 py-2">{it.codigoCentroCusto || "SEM_CC"}</td>
                        <td className="px-3 py-2">{it.codigoInsumo || "—"}</td>
                        <td className="px-3 py-2">
                          <div className="font-medium">{it.itemDescricao}</div>
                          <div className="text-xs text-slate-500">{it.unidadeMedida || "—"}</div>
                        </td>
                        <td className={`px-3 py-2 text-right font-semibold ${it.deltaQuantidade >= 0 ? "text-emerald-700" : "text-red-700"}`}>
                          {it.deltaQuantidade >= 0 ? "+" : ""}
                          {it.deltaQuantidade}
                        </td>
                        <td className="px-3 py-2">{it.observacao || "—"}</td>
                        <td className="px-3 py-2">
                          <button className="rounded border bg-white px-2 py-1 text-xs hover:bg-slate-50" type="button" onClick={() => removerInsumoExtra(it.id)}>
                            Remover
                          </button>
                        </td>
                      </tr>
                    ))}
                    {!insumosExtras.length ? (
                      <tr>
                        <td colSpan={7} className="px-3 py-6 text-center text-slate-500">
                          Nenhum insumo extra lançado nesta semana.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        ) : null}

        {tab === "KANBAN" ? (
          <section className="rounded-xl border bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <div className="text-lg font-semibold">Kanban de Insumos</div>
                <div className="text-xs text-slate-500">Fluxo automático PES → Almoxarifado → Suprimentos → Obra, com regras de transição.</div>
              </div>
              <button
                className="rounded-lg border bg-white px-4 py-2 text-sm hover:bg-slate-50 disabled:opacity-50"
                type="button"
                onClick={carregarKanban}
                disabled={kanbanLoading}
              >
                {kanbanLoading ? "Atualizando..." : "Atualizar Kanban"}
              </button>
            </div>

            <div className="mt-4 overflow-x-auto">
              <div className="flex gap-4 min-w-max">
                {kanbanColumns.map((col) => (
                  <div
                    key={col}
                    className="w-[280px] rounded-2xl border bg-slate-50 p-2"
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => {
                      if (!dragKanban) return;
                      const origem = Object.values(kanbanData).flat().find((x) => x.id === dragKanban.itemId);
                      if (!origem) return;
                      moverKanban(origem, col);
                    }}
                  >
                    <div className="mb-2 rounded-lg bg-slate-900 px-2 py-1 text-xs font-semibold text-white">{col}</div>
                    <div className="space-y-2">
                      {(kanbanData[col] || []).map((item) => (
                        <div
                          key={item.id}
                          draggable
                          onDragStart={() => setDragKanban({ itemId: item.id, fromStatus: item.status })}
                          onClick={() => {
                            setSelectedKanban(item);
                            setAvaliacaoKanban(item.avaliacaoTexto || "");
                            setDevolverKanban(false);
                            setSolicitarNovamenteKanban(true);
                            setNaturezaCustoKanban((item.naturezaCusto as any) || "MATERIAL");
                            setQuantidadeConsumidaKanban(String(item.quantidade || ""));
                            const baseQtd = Math.max(0.0001, Number(item.quantidade || 0));
                            setCustoUnitarioConsumidoKanban(String(Number((Number(item.custo || 0) / baseQtd).toFixed(6))));
                            setDestinoTipoLocalKanban((item.transferencia?.destinoTipoLocal as any) || "UNIDADE");
                            setDestinoIdLocalKanban(item.transferencia?.destinoIdLocal == null ? "" : String(item.transferencia.destinoIdLocal));
                            setFreteInternoKanban(item.transferencia?.freteInterno == null ? "" : String(item.transferencia.freteInterno));
                          }}
                          className={`cursor-move rounded-xl border p-3 shadow-sm ${statusBg(item.status)}`}
                        >
                          <div className="font-semibold text-sm">{item.nome}</div>
                          <div className="text-xs text-slate-600">Tipo: {item.tipo}</div>
                          <div className="text-xs text-slate-600">CC: {item.cc || "SEM_CC"} • Serviço: {item.servico || "—"}</div>
                          <div className="text-xs">📅 {item.prazo || semanaInicio}</div>
                          <div className="text-xs">💰 R$ {Number(item.custo || 0).toFixed(2)}</div>
                          <div className="text-xs">Qtd: {item.quantidade} {item.unidade || ""}</div>
                          <div className="text-xs">Prioridade: {item.prioridade}</div>
                          {item.slaHoras == null ? null : (
                            <div className={`text-xs ${item.slaAtrasado ? "text-red-700" : "text-slate-600"}`}>
                              ⏱️ SLA: {item.slaHoras}h{item.slaLimiteHoras == null ? "" : ` / ${item.slaLimiteHoras}h`}
                            </div>
                          )}
                          {item.validacao?.disponivel == null ? null : (
                            <div className="text-[11px] text-slate-500">
                              Disp.: {item.validacao.disponivel} (saldo {item.validacao.saldo} - reservas {item.validacao.reservas} - req {item.validacao.requisicoes})
                            </div>
                          )}
                        </div>
                      ))}
                      {!kanbanData[col]?.length ? <div className="rounded-lg border border-dashed p-3 text-xs text-slate-500">Sem cards.</div> : null}
                    </div>
                  </div>
                ))}
                {!kanbanColumns.length ? <div className="text-sm text-slate-500">Nenhum card no Kanban para esta semana.</div> : null}
              </div>
            </div>

            <div className="mt-6 rounded-lg border bg-white p-3">
              <div className="font-semibold">Itens Não Aprovados</div>
              <div className="mt-2 space-y-2 text-sm">
                {kanbanNaoAprovados.map((item) => (
                  <div key={`na-${item.id}`} className="rounded border bg-red-50 p-2 text-red-700">
                    {item.codigo} - {item.nome} | Status: {item.status} | Motivo: {item.avaliacaoTexto || "Sem justificativa"}
                  </div>
                ))}
                {!kanbanNaoAprovados.length ? <div className="text-slate-500">Nenhum item não aprovado.</div> : null}
              </div>
            </div>

            {selectedKanban ? (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
                <div className="w-full max-w-[520px] rounded-2xl bg-white p-6 shadow-xl">
                  <h2 className="text-lg font-bold">{selectedKanban.nome}</h2>
                  <div className="mt-1 text-sm text-slate-600">Fornecedor: {selectedKanban.fornecedor || "Não informado"}</div>
                  <div className="text-sm text-slate-600">Tipo: {selectedKanban.tipo}</div>
                  <div className="text-sm text-slate-600">Status atual: {selectedKanban.status}</div>

                  <textarea
                    placeholder="Avaliar produto / justificar devolução"
                    className="mt-3 w-full rounded-lg border p-2 text-sm"
                    value={avaliacaoKanban}
                    onChange={(e) => setAvaliacaoKanban(e.target.value)}
                    rows={4}
                  />

                  <div className="mt-2 flex items-center gap-2">
                    <input type="checkbox" checked={devolverKanban} onChange={() => setDevolverKanban((v) => !v)} />
                    <span className="text-sm">Marcar devolução</span>
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <input type="checkbox" checked={solicitarNovamenteKanban} onChange={() => setSolicitarNovamenteKanban((v) => !v)} />
                    <span className="text-sm">Solicitar novamente após devolução</span>
                  </div>

                  <div className="mt-3 rounded-lg border bg-slate-50 p-3">
                    <div className="text-xs font-semibold text-slate-700">Apropriação por natureza de custo</div>
                    <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-3">
                      <select className="rounded-lg border px-2 py-1 text-sm" value={naturezaCustoKanban} onChange={(e) => setNaturezaCustoKanban(e.target.value as any)}>
                        <option value="MAO">Mão de Obra</option>
                        <option value="FERRAMENTA">Ferramenta</option>
                        <option value="EQUIPAMENTO">Equipamento</option>
                        <option value="MATERIAL">Material</option>
                      </select>
                      <input
                        className="rounded-lg border px-2 py-1 text-sm"
                        placeholder="Qtd consumida"
                        value={quantidadeConsumidaKanban}
                        onChange={(e) => setQuantidadeConsumidaKanban(e.target.value)}
                      />
                      <input
                        className="rounded-lg border px-2 py-1 text-sm"
                        placeholder="Custo unitário"
                        value={custoUnitarioConsumidoKanban}
                        onChange={(e) => setCustoUnitarioConsumidoKanban(e.target.value)}
                      />
                    </div>
                    <div className="mt-1 text-[11px] text-slate-500">Apropria no CC/Serviço e consolida custo real por natureza para DRE da obra.</div>
                  </div>

                  <div className="mt-3 rounded-lg border bg-slate-50 p-3">
                    <div className="text-xs font-semibold text-slate-700">Transferência entre unidades/obras</div>
                    <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-3">
                      <select className="rounded-lg border px-2 py-1 text-sm" value={destinoTipoLocalKanban} onChange={(e) => setDestinoTipoLocalKanban(e.target.value as any)}>
                        <option value="ALMOXARIFADO">Almoxarifado</option>
                        <option value="UNIDADE">Unidade</option>
                        <option value="OBRA">Obra</option>
                      </select>
                      <input
                        className="rounded-lg border px-2 py-1 text-sm"
                        placeholder="ID destino"
                        value={destinoIdLocalKanban}
                        onChange={(e) => setDestinoIdLocalKanban(e.target.value)}
                      />
                      <input
                        className="rounded-lg border px-2 py-1 text-sm"
                        placeholder="Frete interno (R$)"
                        value={freteInternoKanban}
                        onChange={(e) => setFreteInternoKanban(e.target.value)}
                      />
                    </div>
                    <div className="mt-1 text-[11px] text-slate-500">A transferência atualiza origem/destino e soma frete interno no custo total do insumo.</div>
                  </div>

                  <div className="mt-4 flex flex-wrap justify-between gap-2">
                    <button
                      className="rounded-lg bg-emerald-700 px-4 py-2 text-sm text-white"
                      type="button"
                      onClick={async () => {
                        const qtd = Number(String(quantidadeConsumidaKanban || "").replace(",", "."));
                        const cu = Number(String(custoUnitarioConsumidoKanban || "").replace(",", "."));
                        await moverKanban(selectedKanban, "CONSUMIDO", {
                          naturezaCusto: naturezaCustoKanban,
                          quantidadeConsumida: Number.isFinite(qtd) ? qtd : null,
                          custoUnitario: Number.isFinite(cu) ? cu : null,
                          observacaoApropriacao: avaliacaoKanban || null,
                        });
                        setSelectedKanban(null);
                      }}
                    >
                      Apropriar consumo
                    </button>
                    <button className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white" type="button" onClick={() => avaliarKanban("AVALIAR")}>
                      Avaliar
                    </button>
                    <button className="rounded-lg bg-red-600 px-4 py-2 text-sm text-white" type="button" onClick={() => avaliarKanban("DEVOLVER")}>
                      Devolver
                    </button>
                    <button
                      className="rounded-lg bg-amber-600 px-4 py-2 text-sm text-white"
                      type="button"
                      onClick={async () => {
                        await moverKanban(selectedKanban, "DEVOLUCAO_ALMOX");
                        setSelectedKanban(null);
                        setDestinoTipoLocalKanban("UNIDADE");
                        setDestinoIdLocalKanban("");
                        setFreteInternoKanban("");
                      }}
                    >
                      Devolver ao almoxarifado
                    </button>
                    <button
                      className="rounded-lg bg-indigo-600 px-4 py-2 text-sm text-white"
                      type="button"
                      onClick={async () => {
                        const destId = Number(destinoIdLocalKanban);
                        const frete = Number(String(freteInternoKanban || "").replace(",", "."));
                        await moverKanban(selectedKanban, "TRANSFERENCIA", {
                          destinoTipoLocal: destinoTipoLocalKanban,
                          destinoIdLocal: destId,
                          freteInternoTotal: Number.isFinite(frete) && frete > 0 ? frete : 0,
                        });
                        setSelectedKanban(null);
                        setDestinoTipoLocalKanban("UNIDADE");
                        setDestinoIdLocalKanban("");
                        setFreteInternoKanban("");
                      }}
                    >
                      Transferir destino
                    </button>
                    <button
                      className="rounded-lg border bg-white px-4 py-2 text-sm"
                      type="button"
                      onClick={() => {
                        setSelectedKanban(null);
                        setAvaliacaoKanban("");
                        setDevolverKanban(false);
                        setSolicitarNovamenteKanban(true);
                        setDestinoTipoLocalKanban("UNIDADE");
                        setDestinoIdLocalKanban("");
                        setFreteInternoKanban("");
                        setNaturezaCustoKanban("MATERIAL");
                        setQuantidadeConsumidaKanban("");
                        setCustoUnitarioConsumidoKanban("");
                      }}
                    >
                      Fechar
                    </button>
                  </div>
                </div>
              </div>
            ) : null}
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
                <div className="text-xs text-slate-500">Salvos no banco de dados para colaboração.</div>
              </div>
              <button className="rounded-lg border bg-white px-4 py-2 text-sm hover:bg-slate-50 disabled:opacity-50" type="button" onClick={salvarCenarioAtual} disabled={!data?.gantt?.ccs?.length}>
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
                            onClick={() => removerCenario(s.id)}
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
