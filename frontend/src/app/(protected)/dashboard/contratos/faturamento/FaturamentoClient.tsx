"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import api from "@/lib/api";

type ContratoLite = {
  id: number;
  contratoPrincipalId?: number | null;
  numeroContrato: string;
  nome: string | null;
  objeto: string | null;
  empresaParceiraNome: string | null;
};

type SerieRow = {
  mes: string; // YYYY-MM
  receita: number;
  despesa: number;
  liquida: number;
};

function money(v: number) {
  const n = Number.isFinite(v) ? v : 0;
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function moneyClass(v: number) {
  const n = Number.isFinite(v) ? v : 0;
  return n < 0 ? "text-red-600" : "text-[#111827]";
}

function monthLabel(ym: string) {
  const [y, m] = String(ym || "").split("-");
  const mm = Number(m);
  const nomes = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  const nome = mm >= 1 && mm <= 12 ? nomes[mm - 1] : String(m || "");
  return `${nome}/${String(y || "").slice(-2)}`;
}

function toMonthInput(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function clamp(v: number, a: number, b: number) {
  return Math.max(a, Math.min(b, v));
}

function buildLinePath(points: Array<{ x: number; y: number }>) {
  if (!points.length) return "";
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length; i += 1) d += ` L ${points[i].x} ${points[i].y}`;
  return d;
}

export default function FaturamentoClient() {
  const [periodoInicio, setPeriodoInicio] = useState(() => {
    const now = new Date();
    const d = new Date(now.getFullYear(), now.getMonth() - 11, 1);
    return toMonthInput(d);
  });
  const [periodoFim, setPeriodoFim] = useState(() => toMonthInput(new Date()));
  const [contratoId, setContratoId] = useState<string>("");
  const [empresa, setEmpresa] = useState("");
  const [modo, setModo] = useState<"MENSAL" | "ACUMULADO">("MENSAL");

  const [contratos, setContratos] = useState<ContratoLite[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [serieMensal, setSerieMensal] = useState<SerieRow[]>([]);
  const [resumo, setResumo] = useState<{ receitaTotal: number; despesaTotal: number; lucroTotal: number; margem: number | null } | null>(null);

  const chartRef = useRef<HTMLDivElement | null>(null);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [tooltip, setTooltip] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api.get("/api/contratos");
        const rows = Array.isArray(res.data) ? (res.data as any[]) : [];
        const mapped: ContratoLite[] = rows.map((r) => ({
          id: Number(r.id),
          contratoPrincipalId: r.contratoPrincipalId == null ? null : Number(r.contratoPrincipalId),
          numeroContrato: String(r.numeroContrato || ""),
          nome: r.nome ? String(r.nome) : null,
          objeto: r.objeto ? String(r.objeto) : null,
          empresaParceiraNome: r.empresaParceiraNome ? String(r.empresaParceiraNome) : null,
        }));
        if (cancelled) return;
        setContratos(mapped.filter((c) => Number.isFinite(c.id)));
      } catch {
        if (cancelled) return;
        setContratos([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const contratosPrincipais = useMemo(() => contratos.filter((c) => !c.contratoPrincipalId), [contratos]);

  const serie = useMemo(() => {
    if (modo === "MENSAL") return serieMensal;
    let r = 0;
    let d = 0;
    return serieMensal.map((s) => {
      r += s.receita || 0;
      d += s.despesa || 0;
      return { mes: s.mes, receita: r, despesa: d, liquida: r - d };
    });
  }, [modo, serieMensal]);

  async function carregar() {
    try {
      setLoading(true);
      setErr(null);
      const params: any = { start: periodoInicio, end: periodoFim };
      if (contratoId) params.contratoId = Number(contratoId);
      if (empresa.trim()) params.empresa = empresa.trim();
      const res = await api.get("/api/contratos/faturamento", { params });
      const data = res.data as any;
      setSerieMensal((Array.isArray(data?.serie) ? data.serie : []) as SerieRow[]);
      setResumo(data?.resumo ?? null);
    } catch (e: any) {
      setErr(e?.response?.data?.message || e?.message || "Erro ao carregar faturamento");
      setSerieMensal([]);
      setResumo(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const t = setTimeout(() => {
      carregar();
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodoInicio, periodoFim, contratoId, empresa]);

  const hasData = useMemo(() => {
    return (serieMensal || []).some((s) => (s.receita || 0) !== 0 || (s.despesa || 0) !== 0 || (s.liquida || 0) !== 0);
  }, [serieMensal]);

  const chart = useMemo(() => {
    const w = 980;
    const h = 320;
    const padL = 58;
    const padR = 18;
    const padT = 18;
    const padB = 46;
    const innerW = w - padL - padR;
    const innerH = h - padT - padB;

    const values: number[] = [];
    for (const s of serie) {
      values.push(s.receita || 0, s.despesa || 0, s.liquida || 0);
    }
    const minV = Math.min(0, ...values);
    const maxV = Math.max(1, ...values);
    const span = Math.max(1, maxV - minV);
    const yMin = minV - span * 0.08;
    const yMax = maxV + span * 0.08;

    const x = (i: number) => {
      if (serie.length <= 1) return padL + innerW / 2;
      return padL + (innerW * i) / (serie.length - 1);
    };
    const y = (v: number) => {
      const t = (v - yMin) / (yMax - yMin);
      return padT + innerH * (1 - t);
    };

    const pointsR = serie.map((s, i) => ({ x: x(i), y: y(s.receita || 0) }));
    const pointsD = serie.map((s, i) => ({ x: x(i), y: y(s.despesa || 0) }));
    const pointsL = serie.map((s, i) => ({ x: x(i), y: y(s.liquida || 0) }));

    const zeroY = y(0);
    const ticks = 5;
    const yTicks = Array.from({ length: ticks + 1 }).map((_, i) => {
      const t = i / ticks;
      const v = yMax - (yMax - yMin) * t;
      return { v, y: y(v) };
    });

    const negSegments = serie
      .map((s, i) => ({ i, neg: (s.liquida || 0) < 0 }))
      .filter((r) => r.neg)
      .map((r) => r.i);

    return {
      w,
      h,
      padL,
      padR,
      padT,
      padB,
      innerW,
      innerH,
      yMin,
      yMax,
      x,
      y,
      zeroY,
      yTicks,
      pathReceita: buildLinePath(pointsR),
      pathDespesa: buildLinePath(pointsD),
      pathLiquida: buildLinePath(pointsL),
      negSegments,
    };
  }, [serie]);

  function onMove(e: React.MouseEvent) {
    if (!chartRef.current) return;
    const rect = chartRef.current.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    setTooltip({ x: px, y: py });
    if (!serie.length) {
      setHoverIdx(null);
      return;
    }
    const i = Math.round(((px - 58) / (980 - 58 - 18)) * (serie.length - 1));
    setHoverIdx(clamp(i, 0, serie.length - 1));
  }

  function onLeave() {
    setHoverIdx(null);
    setTooltip(null);
  }

  const hover = useMemo(() => {
    if (hoverIdx == null || hoverIdx < 0 || hoverIdx >= serie.length) return null;
    const s = serie[hoverIdx];
    return {
      idx: hoverIdx,
      mes: s.mes,
      receita: s.receita || 0,
      despesa: s.despesa || 0,
      liquida: s.liquida || 0,
      x: chart.x(hoverIdx),
      y: chart.y(s.liquida || 0),
    };
  }, [hoverIdx, serie, chart]);

  return (
    <div className="p-6 space-y-6 bg-[#f7f8fa] text-[#111827]">
      <div>
        <h1 className="text-2xl font-semibold">Contratos → Faturamento</h1>
        <div className="text-sm text-[#6B7280]">DRE simplificado por contrato: Receita, Despesa e Receita Líquida.</div>
      </div>

      <section className="rounded-xl border border-[#E5E7EB] bg-white p-4 shadow-sm space-y-3">
        <div className="text-sm font-semibold">Filtros</div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-6">
          <div className="md:col-span-1">
            <div className="text-sm text-[#6B7280]">Início</div>
            <input className="input bg-white text-[#111827]" type="month" value={periodoInicio} onChange={(e) => setPeriodoInicio(e.target.value)} />
          </div>
          <div className="md:col-span-1">
            <div className="text-sm text-[#6B7280]">Fim</div>
            <input className="input bg-white text-[#111827]" type="month" value={periodoFim} onChange={(e) => setPeriodoFim(e.target.value)} />
          </div>
          <div className="md:col-span-2">
            <div className="text-sm text-[#6B7280]">Contrato</div>
            <select className="input bg-white text-[#111827]" value={contratoId} onChange={(e) => setContratoId(e.target.value)}>
              <option value="">Todos</option>
              {contratosPrincipais.map((c) => (
                <option key={c.id} value={String(c.id)}>
                  {c.numeroContrato} — {c.nome || c.objeto || "—"}
                </option>
              ))}
            </select>
          </div>
          <div className="md:col-span-2">
            <div className="text-sm text-[#6B7280]">Empresa / Cliente</div>
            <input className="input bg-white text-[#111827]" value={empresa} onChange={(e) => setEmpresa(e.target.value)} placeholder="Ex: Prefeitura, Construtora..." />
          </div>
          <div className="md:col-span-6 flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <button className="rounded-lg bg-[#2563EB] px-4 py-2 text-sm text-white hover:bg-[#1D4ED8]" type="button" onClick={carregar} disabled={loading}>
                {loading ? "Atualizando..." : "Atualizar"}
              </button>
              <div className="flex items-center gap-2 text-sm text-[#6B7280]">
                <span className="font-medium text-[#111827]">Modo</span>
                <button
                  type="button"
                  className={`rounded-lg border px-3 py-1 ${modo === "MENSAL" ? "border-[#2563EB] bg-[#DBEAFE] text-[#111827]" : "border-[#D1D5DB] bg-white text-[#111827] hover:bg-[#F9FAFB]"}`}
                  onClick={() => setModo("MENSAL")}
                >
                  Mensal
                </button>
                <button
                  type="button"
                  className={`rounded-lg border px-3 py-1 ${modo === "ACUMULADO" ? "border-[#2563EB] bg-[#DBEAFE] text-[#111827]" : "border-[#D1D5DB] bg-white text-[#111827] hover:bg-[#F9FAFB]"}`}
                  onClick={() => setModo("ACUMULADO")}
                >
                  Acumulado
                </button>
              </div>
            </div>
            {err ? <div className="text-sm text-red-600">{err}</div> : null}
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-[#E5E7EB] bg-white p-4 shadow-sm space-y-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <div className="text-sm font-semibold">Receita x Despesa x Receita Líquida</div>
            <div className="text-sm text-[#6B7280]">Receita Líquida = Receita - Despesa</div>
          </div>
          <div className="flex items-center gap-4 text-xs text-[#6B7280]">
            <div className="flex items-center gap-2">
              <span className="inline-block h-2 w-6 rounded" style={{ background: "#22C55E" }} />
              Receita
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-block h-2 w-6 rounded" style={{ background: "#EF4444" }} />
              Despesa
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-block h-2 w-6 rounded" style={{ background: "#3B82F6" }} />
              Receita Líquida
            </div>
          </div>
        </div>

        {!loading && !hasData ? (
          <div className="rounded-lg border border-[#E5E7EB] bg-[#F9FAFB] p-4 text-sm text-[#6B7280]">Nenhum dado encontrado para o período.</div>
        ) : (
          <div className="relative" ref={chartRef} onMouseMove={onMove} onMouseLeave={onLeave}>
            <svg viewBox={`0 0 ${chart.w} ${chart.h}`} className="w-full">
              <rect x="0" y="0" width={chart.w} height={chart.h} fill="#FFFFFF" />

              {chart.yTicks.map((t, i) => (
                <g key={i}>
                  <line x1={chart.padL} y1={t.y} x2={chart.w - chart.padR} y2={t.y} stroke="#E5E7EB" strokeWidth="1" />
                  <text x={chart.padL - 10} y={t.y + 4} textAnchor="end" fontSize="11" fill="#6B7280">
                    {money(t.v).replace("R$", "").trim()}
                  </text>
                </g>
              ))}

              {serie.map((s, i) => (
                <line key={i} x1={chart.x(i)} y1={chart.padT} x2={chart.x(i)} y2={chart.h - chart.padB} stroke="#F1F3F5" strokeWidth="1" />
              ))}

              <line x1={chart.padL} y1={chart.zeroY} x2={chart.w - chart.padR} y2={chart.zeroY} stroke="#9CA3AF" strokeWidth="1" strokeDasharray="4 4" />

              {chart.negSegments.map((i) => {
                const x0 = chart.x(i) - (serie.length > 1 ? (chart.innerW / (serie.length - 1)) / 2 : 10);
                const w = serie.length > 1 ? chart.innerW / (serie.length - 1) : 20;
                return <rect key={i} x={x0} y={chart.padT} width={w} height={chart.innerH} fill="#EF4444" opacity="0.05" />;
              })}

              <path d={chart.pathReceita} fill="none" stroke="#22C55E" strokeWidth="2.5" />
              <path d={chart.pathDespesa} fill="none" stroke="#EF4444" strokeWidth="2.5" />
              <path d={chart.pathLiquida} fill="none" stroke="#3B82F6" strokeWidth="2.5" />

              {hover ? (
                <g>
                  <line x1={hover.x} y1={chart.padT} x2={hover.x} y2={chart.h - chart.padB} stroke="#111827" opacity="0.12" />
                  <circle cx={hover.x} cy={chart.y(hover.receita)} r="4" fill="#22C55E" />
                  <circle cx={hover.x} cy={chart.y(hover.despesa)} r="4" fill="#EF4444" />
                  <circle cx={hover.x} cy={chart.y(hover.liquida)} r="4" fill="#3B82F6" />
                </g>
              ) : null}

              {serie.map((s, i) => (
                <text key={i} x={chart.x(i)} y={chart.h - 18} textAnchor="middle" fontSize="11" fill="#6B7280">
                  {monthLabel(s.mes)}
                </text>
              ))}
            </svg>

            {hover && tooltip ? (
              <div
                className="pointer-events-none absolute rounded-lg border border-[#E5E7EB] bg-white px-3 py-2 text-xs text-[#111827] shadow-sm"
                style={{
                  left: clamp(tooltip.x + 12, 8, (chartRef.current?.clientWidth || 0) - 220),
                  top: clamp(tooltip.y + 12, 8, (chartRef.current?.clientHeight || 0) - 120),
                  width: 210,
                }}
              >
                <div className="font-semibold">{hover.mes}</div>
                <div className="mt-1 text-[#6B7280]">
                  Receita: <span className={moneyClass(hover.receita)}>{money(hover.receita)}</span>
                </div>
                <div className="text-[#6B7280]">
                  Despesa: <span className={moneyClass(hover.despesa)}>{money(hover.despesa)}</span>
                </div>
                <div className="text-[#6B7280]">
                  {hover.liquida >= 0 ? "Lucro" : "Prejuízo"}: <span className={moneyClass(hover.liquida)}>{money(hover.liquida)}</span>
                </div>
              </div>
            ) : null}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <div className="rounded-xl border border-[#E5E7EB] bg-white p-4">
            <div className="text-xs text-[#6B7280]">Receita Total</div>
            <div className={`text-lg font-semibold ${moneyClass(resumo?.receitaTotal ?? 0)}`}>{money(resumo?.receitaTotal ?? 0)}</div>
          </div>
          <div className="rounded-xl border border-[#E5E7EB] bg-white p-4">
            <div className="text-xs text-[#6B7280]">Despesa Total</div>
            <div className={`text-lg font-semibold ${moneyClass(resumo?.despesaTotal ?? 0)}`}>{money(resumo?.despesaTotal ?? 0)}</div>
          </div>
          <div className="rounded-xl border border-[#E5E7EB] bg-white p-4">
            <div className="text-xs text-[#6B7280]">{(resumo?.lucroTotal ?? 0) >= 0 ? "Lucro Total" : "Prejuízo Total"}</div>
            <div className={`text-lg font-semibold ${moneyClass(resumo?.lucroTotal ?? 0)}`}>{money(resumo?.lucroTotal ?? 0)}</div>
          </div>
          <div className="rounded-xl border border-[#E5E7EB] bg-white p-4">
            <div className="text-xs text-[#6B7280]">Margem (%)</div>
            <div className="text-lg font-semibold">{resumo?.margem == null ? "—" : `${Math.round(resumo.margem * 100)}%`}</div>
          </div>
        </div>
      </section>
    </div>
  );
}
