"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import api from "@/lib/api";

type CronogramaItem = {
  id: number;
  servicoId: number;
  codigo: string;
  nome: string;
  dataInicio: string;
  dataFim: string;
  duracaoDias: number;
  progresso: number | null;
};

type Dep = { id: number; origemItemId: number; destinoItemId: number; tipo: string };

type CronogramaPayload = { items: CronogramaItem[]; dependencias: Dep[] };

type Servico = {
  id: number;
  codigo: string;
  nome: string;
  unidade: string | null;
  quantidade: number | null;
  valorUnitario: number | null;
  valorTotal: number | null;
  percentualPeso: number | null;
};

function dateOnlyIso(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseDateOnly(s: string) {
  const v = String(s || "").slice(0, 10);
  const d = new Date(`${v}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function dayDiff(a: Date, b: Date) {
  return Math.round((b.getTime() - a.getTime()) / (24 * 3600 * 1000));
}

function addDays(d: Date, days: number) {
  return new Date(d.getTime() + days * 24 * 3600 * 1000);
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export default function ContratoPlanejamentoClient() {
  const router = useRouter();
  const sp = useSearchParams();
  const contratoId = sp.get("id");

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [data, setData] = useState<CronogramaPayload>({ items: [], dependencias: [] });
  const [servicos, setServicos] = useState<Servico[]>([]);
  const [servicoErr, setServicoErr] = useState<string | null>(null);
  const [codigoServico, setCodigoServico] = useState("");
  const [nomeServico, setNomeServico] = useState("");

  const [zoom, setZoom] = useState(24);
  const [rangeDays, setRangeDays] = useState(90);

  const [depOrigem, setDepOrigem] = useState("");
  const [depDestino, setDepDestino] = useState("");
  const [depTipo, setDepTipo] = useState("FS");
  const [depErr, setDepErr] = useState<string | null>(null);

  const timelineRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const itemRefs = useRef<Record<number, HTMLDivElement | null>>({});

  const baseStart = useMemo(() => {
    const dates = data.items
      .map((i) => parseDateOnly(i.dataInicio))
      .filter(Boolean) as Date[];
    if (!dates.length) {
      const now = new Date();
      return new Date(now.getFullYear(), now.getMonth(), now.getDate());
    }
    let min = dates[0];
    for (const d of dates) if (d.getTime() < min.getTime()) min = d;
    return min;
  }, [data.items]);

  const days = useMemo(() => Array.from({ length: rangeDays }, (_, i) => addDays(baseStart, i)), [baseStart, rangeDays]);

  async function carregar() {
    if (!contratoId) return;
    try {
      setLoading(true);
      setErr(null);
      setServicoErr(null);
      const res = await api.get(`/api/contratos/${contratoId}/cronograma`);
      const payload = res.data as any;
      setData({
        items: (payload?.items || []).map((i: any) => ({
          ...i,
          dataInicio: typeof i.dataInicio === "string" ? i.dataInicio : new Date(i.dataInicio).toISOString(),
          dataFim: typeof i.dataFim === "string" ? i.dataFim : new Date(i.dataFim).toISOString(),
        })),
        dependencias: payload?.dependencias || [],
      });
      const sres = await api.get(`/api/contratos/${contratoId}/servicos`);
      setServicos((sres.data as any[])?.map((s: any) => ({ ...s, quantidade: s.quantidade == null ? null : Number(s.quantidade), valorUnitario: s.valorUnitario == null ? null : Number(s.valorUnitario), valorTotal: s.valorTotal == null ? null : Number(s.valorTotal), percentualPeso: s.percentualPeso == null ? null : Number(s.percentualPeso) })) ?? []);
    } catch (e: any) {
      setErr(e?.response?.data?.message || e?.message || "Erro ao carregar cronograma");
      setData({ items: [], dependencias: [] });
      setServicos([]);
    } finally {
      setLoading(false);
    }
  }

  async function criarServico() {
    if (!contratoId) return;
    try {
      setServicoErr(null);
      await api.post(`/api/contratos/${contratoId}/servicos`, { codigo: codigoServico, nome: nomeServico });
      setCodigoServico("");
      setNomeServico("");
      await carregar();
    } catch (e: any) {
      setServicoErr(e?.response?.data?.message || e?.message || "Erro ao criar serviço");
    }
  }

  async function seedCronograma() {
    if (!contratoId) return;
    try {
      setLoading(true);
      setErr(null);
      await api.post(`/api/contratos/${contratoId}/cronograma/seed`, { duracaoDiasPadrao: 7 });
      await carregar();
    } catch (e: any) {
      setErr(e?.response?.data?.message || e?.message || "Erro ao gerar cronograma");
    } finally {
      setLoading(false);
    }
  }

  async function criarDependencia() {
    if (!contratoId) return;
    try {
      setDepErr(null);
      const origemItemId = Number(depOrigem || 0);
      const destinoItemId = Number(depDestino || 0);
      if (!origemItemId || !destinoItemId) {
        setDepErr("Selecione origem e destino");
        return;
      }
      await api.post(`/api/contratos/${contratoId}/cronograma/dependencias`, { origemItemId, destinoItemId, tipo: depTipo });
      setDepOrigem("");
      setDepDestino("");
      await carregar();
    } catch (e: any) {
      setDepErr(e?.response?.data?.message || e?.message || "Erro ao criar dependência");
    }
  }

  async function removerDependencia(depId: number) {
    if (!contratoId) return;
    await api.delete(`/api/contratos/${contratoId}/cronograma/dependencias/${depId}`);
    await carregar();
  }

  async function atualizarItemDatas(itemId: number, ini: Date, fim: Date) {
    if (!contratoId) return;
    await api.put(`/api/contratos/${contratoId}/cronograma/${itemId}`, { dataInicio: dateOnlyIso(ini), dataFim: dateOnlyIso(fim) });
  }

  useEffect(() => {
    carregar();
  }, []);

  useEffect(() => {
    const el = timelineRef.current;
    if (!el) return;
    const onScroll = () => desenharLinhas();
    el.addEventListener("scroll", onScroll);
    return () => el.removeEventListener("scroll", onScroll);
  }, [data, zoom, rangeDays]);

  function desenharLinhas() {
    const svg = svgRef.current;
    const container = timelineRef.current;
    if (!svg || !container) return;

    const crect = container.getBoundingClientRect();
    const scrollLeft = container.scrollLeft;
    const scrollTop = container.scrollTop;

    const paths: string[] = [];
    for (const dep of data.dependencias) {
      const origemEl = itemRefs.current[dep.origemItemId];
      const destinoEl = itemRefs.current[dep.destinoItemId];
      if (!origemEl || !destinoEl) continue;

      const o = origemEl.getBoundingClientRect();
      const d = destinoEl.getBoundingClientRect();

      const x1 = o.right - crect.left + scrollLeft;
      const y1 = o.top - crect.top + scrollTop + o.height / 2;
      const x2 = d.left - crect.left + scrollLeft;
      const y2 = d.top - crect.top + scrollTop + d.height / 2;

      const offset = 24;
      const mid1x = x1 + offset;
      const mid2x = x2 - offset;
      const p = `M ${x1} ${y1} L ${mid1x} ${y1} L ${mid2x} ${y2} L ${x2} ${y2}`;
      paths.push(p);
    }

    while (svg.firstChild) svg.removeChild(svg.firstChild);
    const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
    const marker = document.createElementNS("http://www.w3.org/2000/svg", "marker");
    marker.setAttribute("id", "arrow");
    marker.setAttribute("markerWidth", "10");
    marker.setAttribute("markerHeight", "10");
    marker.setAttribute("refX", "10");
    marker.setAttribute("refY", "5");
    marker.setAttribute("orient", "auto");
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", "M0,0 L10,5 L0,10 Z");
    path.setAttribute("fill", "#475569");
    marker.appendChild(path);
    defs.appendChild(marker);
    svg.appendChild(defs);

    for (const d of paths) {
      const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
      p.setAttribute("d", d);
      p.setAttribute("stroke", "#475569");
      p.setAttribute("fill", "none");
      p.setAttribute("stroke-width", "1");
      p.setAttribute("marker-end", "url(#arrow)");
      svg.appendChild(p);
    }
  }

  useLayoutEffect(() => {
    requestAnimationFrame(() => desenharLinhas());
  }, [data, zoom, rangeDays]);

  if (!contratoId) {
    return (
      <div className="p-6">
        <div className="rounded-xl border bg-white p-4 shadow-sm text-sm text-slate-600">Informe o contrato via URL: /dashboard/contratos/planejamento?id=123</div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">Planejamento (Gantt) — Contrato #{contratoId}</h1>
          <div className="text-sm text-slate-600">Arraste para mover no tempo, redimensione para alterar duração e use dependências para encadear tarefas.</div>
        </div>
        <div className="flex gap-2">
          <button className="rounded-lg border bg-white px-3 py-2 text-sm hover:bg-slate-50" type="button" onClick={() => router.push(`/dashboard/contratos?id=${contratoId}`)}>
            Voltar ao contrato
          </button>
          <button className="rounded-lg bg-blue-600 px-3 py-2 text-sm text-white disabled:opacity-50" type="button" onClick={seedCronograma} disabled={loading}>
            Gerar cronograma
          </button>
          <button className="rounded-lg border bg-white px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-50" type="button" onClick={carregar} disabled={loading}>
            Atualizar
          </button>
        </div>
      </div>

      {err ? <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div> : null}

      <section className="rounded-xl border bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div>
            <div className="text-sm font-semibold">EAP / Serviços do contrato</div>
            <div className="text-xs text-slate-500">Base do cronograma, do Kanban e da medição financeira.</div>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-3">
          <input className="input" value={codigoServico} onChange={(e) => setCodigoServico(e.target.value)} placeholder="Código (ex: 1.2.3)" />
          <input className="input md:col-span-2" value={nomeServico} onChange={(e) => setNomeServico(e.target.value)} placeholder="Nome do serviço" />
          <div className="md:col-span-3 flex justify-end">
            <button className="rounded-lg bg-slate-800 px-3 py-2 text-sm text-white disabled:opacity-50" type="button" onClick={criarServico} disabled={!codigoServico.trim() || !nomeServico.trim()}>
              Adicionar serviço
            </button>
          </div>
        </div>
        {servicoErr ? <div className="mt-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{servicoErr}</div> : null}

        <div className="mt-3 overflow-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-700">
              <tr>
                <th className="px-3 py-2">Código</th>
                <th className="px-3 py-2">Serviço</th>
              </tr>
            </thead>
            <tbody>
              {servicos.map((s) => (
                <tr key={s.id} className="border-t">
                  <td className="px-3 py-2 font-semibold">{s.codigo}</td>
                  <td className="px-3 py-2">{s.nome}</td>
                </tr>
              ))}
              {!servicos.length ? (
                <tr>
                  <td colSpan={2} className="px-3 py-6 text-center text-slate-500">
                    Nenhum serviço cadastrado.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-xl border bg-white p-4 shadow-sm">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
          <div className="md:col-span-2">
            <div className="text-sm text-slate-600">Zoom</div>
            <select className="input" value={String(zoom)} onChange={(e) => setZoom(Number(e.target.value))}>
              <option value="16">Compacto</option>
              <option value="24">Normal</option>
              <option value="40">Detalhado</option>
            </select>
          </div>
          <div className="md:col-span-2">
            <div className="text-sm text-slate-600">Janela (dias)</div>
            <select className="input" value={String(rangeDays)} onChange={(e) => setRangeDays(Number(e.target.value))}>
              <option value="60">60</option>
              <option value="90">90</option>
              <option value="120">120</option>
              <option value="180">180</option>
            </select>
          </div>
        </div>
      </section>

      <section className="rounded-xl border bg-white p-4 shadow-sm">
        <div className="text-sm font-semibold">Dependências</div>
        <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-5">
          <select className="input md:col-span-2" value={depOrigem} onChange={(e) => setDepOrigem(e.target.value)}>
            <option value="">Origem</option>
            {data.items.map((i) => (
              <option key={i.id} value={String(i.id)}>
                {i.codigo} — {i.nome}
              </option>
            ))}
          </select>
          <select className="input md:col-span-2" value={depDestino} onChange={(e) => setDepDestino(e.target.value)}>
            <option value="">Destino</option>
            {data.items.map((i) => (
              <option key={i.id} value={String(i.id)}>
                {i.codigo} — {i.nome}
              </option>
            ))}
          </select>
          <select className="input" value={depTipo} onChange={(e) => setDepTipo(e.target.value)}>
            <option value="FS">FS</option>
            <option value="SS">SS</option>
            <option value="FF">FF</option>
            <option value="SF">SF</option>
          </select>
          <button className="rounded-lg bg-slate-800 px-3 py-2 text-sm text-white" type="button" onClick={criarDependencia}>
            Adicionar
          </button>
        </div>
        {depErr ? <div className="mt-2 text-sm text-red-700">{depErr}</div> : null}
        <div className="mt-3 space-y-2">
          {data.dependencias.map((d) => (
            <div key={d.id} className="flex items-center justify-between gap-2 rounded-lg border bg-slate-50 p-2 text-sm">
              <div>
                #{d.id} • {d.tipo} • {d.origemItemId} → {d.destinoItemId}
              </div>
              <button className="rounded-lg border bg-white px-3 py-1 text-sm hover:bg-slate-50" type="button" onClick={() => removerDependencia(d.id)}>
                Remover
              </button>
            </div>
          ))}
          {!data.dependencias.length ? <div className="text-sm text-slate-500">Sem dependências.</div> : null}
        </div>
      </section>

      <section className="rounded-xl border bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="text-sm font-semibold">Gantt</div>
          <div className="text-xs text-slate-500">Base: {dateOnlyIso(baseStart)} • Itens: {data.items.length}</div>
        </div>

        <div className="mt-3 border rounded-lg overflow-hidden">
          <div className="grid" style={{ gridTemplateColumns: "340px 1fr" }}>
            <div className="bg-slate-50 border-r">
              <div className="px-3 py-2 text-xs font-semibold text-slate-600 border-b">Serviços</div>
              {data.items.map((i) => (
                <div key={i.id} className="px-3 py-2 border-b text-sm">
                  <div className="font-semibold">{i.codigo}</div>
                  <div className="text-xs text-slate-600">{i.nome}</div>
                </div>
              ))}
              {!data.items.length ? <div className="px-3 py-6 text-sm text-slate-500">Sem itens no cronograma.</div> : null}
            </div>

            <div className="relative">
              <div className="flex border-b bg-slate-50">
                {days.map((d) => (
                  <div key={d.toISOString()} style={{ width: zoom }} className="px-1 py-2 text-[10px] text-slate-600 border-r whitespace-nowrap">
                    {d.getDate().toString().padStart(2, "0")}/{(d.getMonth() + 1).toString().padStart(2, "0")}
                  </div>
                ))}
              </div>

              <div ref={timelineRef} className="relative overflow-auto" style={{ height: 56 + data.items.length * 49 }}>
                <svg ref={svgRef} className="absolute top-0 left-0 pointer-events-none" width={rangeDays * zoom} height={data.items.length * 49} />
                <div style={{ width: rangeDays * zoom }}>
                  {data.items.map((i, idx) => {
                    const ini = parseDateOnly(i.dataInicio) || baseStart;
                    const fim = parseDateOnly(i.dataFim) || addDays(ini, Math.max(1, i.duracaoDias || 1));
                    const leftDays = dayDiff(baseStart, ini);
                    const dur = Math.max(1, dayDiff(ini, fim));
                    const left = clamp(leftDays, 0, rangeDays - 1) * zoom;
                    const width = clamp(dur, 1, rangeDays) * zoom;

                    return (
                      <GanttRow
                        key={i.id}
                        top={idx * 49}
                        left={left}
                        width={width}
                        zoom={zoom}
                        rangeDays={rangeDays}
                        baseStart={baseStart}
                        item={i}
                        onCommit={async (nextIni, nextFim) => {
                          await atualizarItemDatas(i.id, nextIni, nextFim);
                          await carregar();
                        }}
                        registerRef={(el) => {
                          itemRefs.current[i.id] = el;
                        }}
                      />
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function GanttRow(props: {
  top: number;
  left: number;
  width: number;
  zoom: number;
  rangeDays: number;
  baseStart: Date;
  item: CronogramaItem;
  onCommit: (ini: Date, fim: Date) => Promise<void>;
  registerRef: (el: HTMLDivElement | null) => void;
}) {
  const { top, left, width, zoom, rangeDays, baseStart, item, onCommit, registerRef } = props;
  const [dragging, setDragging] = useState<null | { mode: "move" | "resize-left" | "resize-right"; startX: number; startLeft: number; startWidth: number }>(null);
  const [draft, setDraft] = useState<{ left: number; width: number }>({ left, width });

  useEffect(() => {
    setDraft({ left, width });
  }, [left, width]);

  function toDates(nextLeftPx: number, nextWidthPx: number) {
    const startDay = Math.round(nextLeftPx / zoom);
    const durDays = Math.max(1, Math.round(nextWidthPx / zoom));
    const ini = addDays(baseStart, clamp(startDay, 0, rangeDays - 1));
    const fim = addDays(ini, durDays);
    return { ini, fim };
  }

  async function commit(nextLeftPx: number, nextWidthPx: number) {
    const { ini, fim } = toDates(nextLeftPx, nextWidthPx);
    await onCommit(ini, fim);
  }

  useEffect(() => {
    function onMove(e: PointerEvent) {
      if (!dragging) return;
      const dx = e.clientX - dragging.startX;
      const snap = Math.round(dx / zoom) * zoom;
      if (dragging.mode === "move") {
        setDraft({ left: Math.max(0, dragging.startLeft + snap), width: dragging.startWidth });
      } else if (dragging.mode === "resize-left") {
        const nextLeft = Math.max(0, dragging.startLeft + snap);
        const nextWidth = Math.max(zoom, dragging.startWidth - snap);
        setDraft({ left: nextLeft, width: nextWidth });
      } else {
        const nextWidth = Math.max(zoom, dragging.startWidth + snap);
        setDraft({ left: dragging.startLeft, width: nextWidth });
      }
    }

    async function onUp() {
      if (!dragging) return;
      const next = draft;
      setDragging(null);
      await commit(next.left, next.width);
    }

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [dragging, draft, zoom]);

  return (
    <div className="relative border-b" style={{ height: 49 }}>
      <div
        ref={registerRef}
        className={`absolute top-2 h-8 rounded bg-blue-600 text-white text-xs flex items-center px-2 select-none ${dragging ? "opacity-80" : ""}`}
        style={{ left: draft.left, width: draft.width }}
        onPointerDown={(e) => {
          (e.currentTarget as any).setPointerCapture?.(e.pointerId);
          setDragging({ mode: "move", startX: e.clientX, startLeft: draft.left, startWidth: draft.width });
        }}
      >
        <div className="truncate w-full">{item.codigo}</div>
        <div
          className="absolute left-0 top-0 h-full w-2 cursor-ew-resize"
          onPointerDown={(e) => {
            e.stopPropagation();
            setDragging({ mode: "resize-left", startX: e.clientX, startLeft: draft.left, startWidth: draft.width });
          }}
        />
        <div
          className="absolute right-0 top-0 h-full w-2 cursor-ew-resize"
          onPointerDown={(e) => {
            e.stopPropagation();
            setDragging({ mode: "resize-right", startX: e.clientX, startLeft: draft.left, startWidth: draft.width });
          }}
        />
      </div>
    </div>
  );
}
