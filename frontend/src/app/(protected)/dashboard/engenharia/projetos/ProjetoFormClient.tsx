"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import api from "@/lib/api";
import { GlobalWorkerOptions, getDocument } from "pdfjs-dist";

type ApiEnvelope<T> = { success: boolean; message?: string; data: T };
function unwrapApiData<T>(json: any): T {
  if (json && typeof json === "object" && "data" in json) return (json as ApiEnvelope<T>).data;
  return json as T;
}

type ProjetoDTO = {
  idProjeto: number;
  titulo: string;
  endereco: string | null;
  descricao: string | null;
  tipo: string | null;
  numeroProjeto: string | null;
  revisao: string | null;
  status: string | null;
  dataProjeto: string | null;
  dataAprovacao: string | null;
};

type ProjetoResponsavelRow = {
  idProjetoResponsavel: number;
  idProjeto: number;
  idTecnico: number;
  nome: string;
  conselho: string | null;
  numeroRegistro: string | null;
  tipo: "RESPONSAVEL_TECNICO" | "FISCAL_OBRA";
  abrangencia: string | null;
  numeroDocumento: string | null;
  observacao: string | null;
};

type TecnicoRow = {
  idTecnico: number;
  nome: string;
  tituloProfissional: string | null;
  conselho: string | null;
  numeroRegistro: string | null;
};

type ProjetoAnexoRow = {
  idAnexo: number;
  nomeArquivo: string;
  mimeType: string;
  tamanhoBytes: number;
  criadoEm: string;
  atualizadoEm: string;
  possuiAnotacoes: boolean;
};

type AnotacaoPoint = { x: number; y: number };
type AnotacaoTool = "PEN" | "HIGHLIGHT" | "LINE" | "ERASER";
type AnotacaoStroke = {
  tool: AnotacaoTool;
  color: string;
  width: number;
  opacity: number;
  points: AnotacaoPoint[];
};
type AnotacoesDoc = { v: 1; pages: Record<string, AnotacaoStroke[]> };

function safeInternalPath(v: string | null) {
  const s = String(v || "").trim();
  if (!s) return null;
  if (!s.startsWith("/")) return null;
  if (s.startsWith("//")) return null;
  return s;
}

const STATUS_OPTIONS = [
  { value: "APROVADO", label: "Aprovado" },
  { value: "EM_REVISAO", label: "Em revisão" },
  { value: "EM_ELABORACAO", label: "Em elaboração" },
  { value: "CANCELADO", label: "Cancelado" },
];

const TIPO_OPTIONS_BASE = [
  "Arquitetura",
  "Estrutural",
  "Fundações",
  "Geotécnico",
  "Topografia / Levantamento",
  "Terraplenagem",
  "Pavimentação",
  "Drenagem Pluvial",
  "Drenagem Predial",
  "Hidráulico",
  "Sanitário",
  "Hidrossanitário",
  "Elétrico (BT/MT)",
  "Iluminação",
  "SPDA (Para-raios)",
  "Incêndio (PPCI/AVCB)",
  "Climatização (HVAC)",
  "Gás (GN/GLP)",
  "Telecom / Cabeamento",
  "CFTV / Segurança",
  "Automação / BMS",
  "Estradas / Acessos",
  "Contenção / Muros",
  "Acessibilidade",
  "Paisagismo",
  "As Built",
  "Compatibilização",
  "Outros",
];

function normalizeTipoLabel(value: string) {
  return value
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\b\w/g, (m) => m.toUpperCase());
}

function fmtBytes(n: number) {
  const v = Number(n || 0);
  if (!Number.isFinite(v) || v <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let x = v;
  let i = 0;
  while (x >= 1024 && i < units.length - 1) {
    x = x / 1024;
    i++;
  }
  return `${x.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function getFileExt(name: string) {
  const s = String(name || "").trim();
  const idx = s.lastIndexOf(".");
  if (idx <= 0) return "";
  return s.slice(idx + 1).toLowerCase();
}

async function fetchAnexoArrayBuffer(anexoId: number) {
  const res = await api.get(`/api/v1/engenharia/projetos/anexos/${anexoId}/download`, { responseType: "arraybuffer" });
  const buf = res?.data as ArrayBuffer;
  return buf;
}

function createEmptyAnotacoes(): AnotacoesDoc {
  return { v: 1, pages: {} };
}

function AnexoViewerModal(props: {
  open: boolean;
  onClose: () => void;
  anexo: ProjetoAnexoRow | null;
  onSaved: () => void;
}) {
  const { open, onClose, anexo, onSaved } = props;
  const modalRef = useRef<HTMLDivElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const baseCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageCount, setPageCount] = useState(1);
  const [tool, setTool] = useState<AnotacaoTool>("PEN");
  const [color, setColor] = useState("#ef4444");
  const [width, setWidth] = useState(3);
  const [opacity, setOpacity] = useState(1);

  const pdfRef = useRef<any>(null);
  const fileBufferRef = useRef<ArrayBuffer | null>(null);
  const annotRef = useRef<AnotacoesDoc>(createEmptyAnotacoes());
  const drawingRef = useRef(false);
  const currentStrokeRef = useRef<AnotacaoStroke | null>(null);
  const previewStrokeRef = useRef<AnotacaoStroke | null>(null);
  const panningRef = useRef<null | { startX: number; startY: number; panX: number; panY: number }>(null);

  const isPdf = (anexo?.mimeType || "").toLowerCase() === "application/pdf" || getFileExt(anexo?.nomeArquivo || "") === "pdf";
  const [zoom, setZoom] = useState(1);
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);

  function getPageKey(p: number) {
    return String(p);
  }

  function ensurePageStrokes(p: number) {
    const k = getPageKey(p);
    if (!annotRef.current.pages[k]) annotRef.current.pages[k] = [];
    return annotRef.current.pages[k];
  }

  function setCanvasSize(cssW: number, cssH: number) {
    const dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
    const base = baseCanvasRef.current;
    const draw = drawCanvasRef.current;
    if (!base || !draw) return;
    base.style.width = `${cssW}px`;
    base.style.height = `${cssH}px`;
    draw.style.width = `${cssW}px`;
    draw.style.height = `${cssH}px`;
    base.width = Math.round(cssW * dpr);
    base.height = Math.round(cssH * dpr);
    draw.width = Math.round(cssW * dpr);
    draw.height = Math.round(cssH * dpr);
    const bctx = base.getContext("2d");
    const dctx = draw.getContext("2d");
    if (bctx) bctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (dctx) dctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function clearOverlay() {
    const draw = drawCanvasRef.current;
    if (!draw) return;
    const ctx = draw.getContext("2d");
    if (!ctx) return;
    const w = parseFloat(draw.style.width || "0") || draw.width;
    const h = parseFloat(draw.style.height || "0") || draw.height;
    ctx.clearRect(0, 0, w, h);
  }

  function drawStroke(ctx: CanvasRenderingContext2D, stroke: AnotacaoStroke, cssW: number, cssH: number) {
    if (!stroke.points.length) return;
    const composite = stroke.tool === "ERASER" ? "destination-out" : "source-over";
    ctx.save();
    ctx.globalCompositeOperation = composite as any;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = stroke.color;
    ctx.lineWidth = stroke.width;
    ctx.globalAlpha = stroke.opacity;
    const pts = stroke.points.map((p) => ({ x: p.x * cssW, y: p.y * cssH }));
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.stroke();
    ctx.restore();
  }

  function redrawOverlay() {
    const draw = drawCanvasRef.current;
    if (!draw) return;
    const ctx = draw.getContext("2d");
    if (!ctx) return;
    const cssW = parseFloat(draw.style.width || "0") || draw.width;
    const cssH = parseFloat(draw.style.height || "0") || draw.height;
    ctx.clearRect(0, 0, cssW, cssH);
    const strokes = ensurePageStrokes(page);
    for (const s of strokes) drawStroke(ctx, s, cssW, cssH);
    if (previewStrokeRef.current) drawStroke(ctx, previewStrokeRef.current, cssW, cssH);
  }

  function eventToPoint(ev: PointerEvent) {
    const draw = drawCanvasRef.current;
    if (!draw) return null;
    const rect = draw.getBoundingClientRect();
    const x = (ev.clientX - rect.left) / rect.width;
    const y = (ev.clientY - rect.top) / rect.height;
    const nx = Math.max(0, Math.min(1, x));
    const ny = Math.max(0, Math.min(1, y));
    return { x: nx, y: ny };
  }

  async function toggleFullscreen() {
    const el = modalRef.current;
    if (!el) return;
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await el.requestFullscreen();
    } catch {}
  }

  function resetView() {
    setZoom(1);
    setPanX(0);
    setPanY(0);
  }

  async function fitToWindow() {
    resetView();
    if (isPdf) await renderPdfPage(page);
    else await renderImage();
  }

  async function carregarAnotacoes() {
    if (!anexo?.idAnexo) return;
    const res = await api.get(`/api/v1/engenharia/projetos/anexos/${anexo.idAnexo}/anotacoes`);
    const d = unwrapApiData<any>(res?.data || null) as any;
    const payload = d?.anotacoes ?? null;
    if (!payload || typeof payload !== "object") {
      annotRef.current = createEmptyAnotacoes();
      return;
    }
    const pages = payload?.pages && typeof payload.pages === "object" ? payload.pages : {};
    annotRef.current = { v: 1, pages: pages as any };
  }

  async function salvarAnotacoes() {
    if (!anexo?.idAnexo) return;
    try {
      setLoading(true);
      setErr(null);
      await api.put(`/api/v1/engenharia/projetos/anexos/${anexo.idAnexo}/anotacoes`, { anotacoes: annotRef.current });
      onSaved();
      alert("Rabiscos salvos.");
    } catch (e: any) {
      setErr(e?.response?.data?.message || e?.message || "Erro ao salvar rabiscos.");
    } finally {
      setLoading(false);
    }
  }

  async function renderPdfPage(p: number) {
    const pdf = pdfRef.current;
    const container = containerRef.current;
    if (!pdf || !container) return;
    const pageObj = await pdf.getPage(p);
    const v1 = pageObj.getViewport({ scale: 1 });
    const maxW = Math.max(320, container.clientWidth - 16);
    const maxH = Math.max(320, container.clientHeight - 16);
    const scaleFit = Math.min(maxW / v1.width, maxH / v1.height);
    const scale = Math.min(2, Math.max(0.25, scaleFit));
    const viewport = pageObj.getViewport({ scale });
    setCanvasSize(viewport.width, viewport.height);
    const base = baseCanvasRef.current;
    if (!base) return;
    const ctx = base.getContext("2d");
    if (!ctx) return;
    await pageObj.render({ canvasContext: ctx as any, viewport: viewport as any }).promise;
    previewStrokeRef.current = null;
    redrawOverlay();
  }

  async function renderImage() {
    const buf = fileBufferRef.current;
    const container = containerRef.current;
    if (!buf || !container) return;
    const base = baseCanvasRef.current;
    if (!base) return;
    const blob = new Blob([buf], { type: anexo?.mimeType || "image/*" });
    const url = URL.createObjectURL(blob);
    try {
      const img = new Image();
      const loaded = await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error("Falha ao carregar imagem"));
        img.src = url;
      });
      void loaded;
      const maxW = Math.max(320, container.clientWidth - 16);
      const maxH = Math.max(320, container.clientHeight - 16);
      const scaleFit = Math.min(maxW / img.naturalWidth, maxH / img.naturalHeight);
      const scale = Math.min(2, Math.max(0.1, scaleFit));
      const cssW = img.naturalWidth * scale;
      const cssH = img.naturalHeight * scale;
      setCanvasSize(cssW, cssH);
      const ctx = base.getContext("2d");
      if (!ctx) return;
      ctx.clearRect(0, 0, cssW, cssH);
      ctx.drawImage(img, 0, 0, cssW, cssH);
      previewStrokeRef.current = null;
      redrawOverlay();
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  async function carregarArquivoEPreparar() {
    if (!anexo?.idAnexo) return;
    setLoading(true);
    setErr(null);
    try {
      resetView();
      const buf = await fetchAnexoArrayBuffer(anexo.idAnexo);
      fileBufferRef.current = buf;
      await carregarAnotacoes();
      setPage(1);
      previewStrokeRef.current = null;
      if (isPdf) {
        GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
        const task = getDocument({ data: new Uint8Array(buf) } as any);
        const pdf = await task.promise;
        pdfRef.current = pdf;
        setPageCount(pdf.numPages || 1);
        await renderPdfPage(1);
      } else {
        pdfRef.current = null;
        setPageCount(1);
        await renderImage();
      }
    } catch (e: any) {
      setErr(e?.message || "Erro ao abrir anexo.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!open) return;
    carregarArquivoEPreparar();
  }, [open, anexo?.idAnexo]);

  useEffect(() => {
    if (!open) return;
    function onFsChange() {
      setIsFullscreen(Boolean(document.fullscreenElement));
    }
    document.addEventListener("fullscreenchange", onFsChange);
    onFsChange();
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (!anexo?.idAnexo) return;
    (async () => {
      try {
        setLoading(true);
        setErr(null);
        previewStrokeRef.current = null;
        if (isPdf) await renderPdfPage(page);
        else await renderImage();
      } catch (e: any) {
        setErr(e?.message || "Erro ao renderizar.");
      } finally {
        setLoading(false);
      }
    })();
  }, [page]);

  useEffect(() => {
    if (!open) return;
    const draw = drawCanvasRef.current;
    if (!draw) return;

    function onPointerDown(ev: PointerEvent) {
      if (ev.button !== 0) return;
      if (loading) return;
      const pt = eventToPoint(ev);
      if (!pt) return;
      drawingRef.current = true;
      (ev.currentTarget as HTMLCanvasElement).setPointerCapture(ev.pointerId);
      const stroke: AnotacaoStroke = {
        tool,
        color: tool === "ERASER" ? "#000000" : tool === "HIGHLIGHT" ? color : color,
        width: tool === "HIGHLIGHT" ? Math.max(6, width * 2) : width,
        opacity: tool === "HIGHLIGHT" ? Math.min(0.45, opacity) : opacity,
        points: [pt],
      };
      currentStrokeRef.current = stroke;
      previewStrokeRef.current = tool === "LINE" ? stroke : null;
      redrawOverlay();
    }

    function onPointerMove(ev: PointerEvent) {
      if (!drawingRef.current) return;
      const pt = eventToPoint(ev);
      if (!pt) return;
      const cur = currentStrokeRef.current;
      if (!cur) return;
      if (tool === "LINE") {
        const start = cur.points[0];
        cur.points = [start, pt];
        previewStrokeRef.current = cur;
      } else {
        cur.points.push(pt);
      }
      redrawOverlay();
    }

    function onPointerUp(ev: PointerEvent) {
      if (!drawingRef.current) return;
      drawingRef.current = false;
      try {
        (ev.currentTarget as HTMLCanvasElement).releasePointerCapture(ev.pointerId);
      } catch {}
      const cur = currentStrokeRef.current;
      currentStrokeRef.current = null;
      const valid = cur && cur.points.length >= (tool === "LINE" ? 2 : 1);
      previewStrokeRef.current = null;
      if (!valid) {
        redrawOverlay();
        return;
      }
      const strokes = ensurePageStrokes(page);
      strokes.push(cur as any);
      redrawOverlay();
    }

    draw.addEventListener("pointerdown", onPointerDown);
    draw.addEventListener("pointermove", onPointerMove);
    draw.addEventListener("pointerup", onPointerUp);
    draw.addEventListener("pointercancel", onPointerUp);
    return () => {
      draw.removeEventListener("pointerdown", onPointerDown);
      draw.removeEventListener("pointermove", onPointerMove);
      draw.removeEventListener("pointerup", onPointerUp);
      draw.removeEventListener("pointercancel", onPointerUp);
    };
  }, [open, tool, color, width, opacity, page, loading]);

  useEffect(() => {
    if (!open) return;
    const container = containerRef.current;
    const content = contentRef.current;
    if (!container || !content) return;

    function onContextMenu(ev: MouseEvent) {
      ev.preventDefault();
    }

    function onWheel(ev: WheelEvent) {
      const containerEl = containerRef.current;
      if (!containerEl) return;
      ev.preventDefault();
      const rect = containerEl.getBoundingClientRect();
      const cx = ev.clientX - rect.left;
      const cy = ev.clientY - rect.top;
      const z0 = zoom;
      const delta = ev.deltaY;
      const step = delta > 0 ? 0.9 : 1.1;
      const z1 = Math.max(0.2, Math.min(5, z0 * step));
      if (z1 === z0) return;
      const ratio = z1 / z0;
      setZoom(z1);
      setPanX((p) => cx - (cx - p) * ratio);
      setPanY((p) => cy - (cy - p) * ratio);
    }

    function onPointerDown(ev: PointerEvent) {
      if (ev.button !== 2) return;
      ev.preventDefault();
      panningRef.current = { startX: ev.clientX, startY: ev.clientY, panX, panY };
      (ev.currentTarget as HTMLDivElement).setPointerCapture(ev.pointerId);
    }

    function onPointerMove(ev: PointerEvent) {
      if (!panningRef.current) return;
      ev.preventDefault();
      const dx = ev.clientX - panningRef.current.startX;
      const dy = ev.clientY - panningRef.current.startY;
      setPanX(panningRef.current.panX + dx);
      setPanY(panningRef.current.panY + dy);
    }

    function onPointerUp(ev: PointerEvent) {
      if (!panningRef.current) return;
      ev.preventDefault();
      panningRef.current = null;
      try {
        (ev.currentTarget as HTMLDivElement).releasePointerCapture(ev.pointerId);
      } catch {}
    }

    container.addEventListener("contextmenu", onContextMenu);
    container.addEventListener("wheel", onWheel, { passive: false });
    container.addEventListener("pointerdown", onPointerDown);
    container.addEventListener("pointermove", onPointerMove);
    container.addEventListener("pointerup", onPointerUp);
    container.addEventListener("pointercancel", onPointerUp);
    return () => {
      container.removeEventListener("contextmenu", onContextMenu);
      container.removeEventListener("wheel", onWheel as any);
      container.removeEventListener("pointerdown", onPointerDown);
      container.removeEventListener("pointermove", onPointerMove);
      container.removeEventListener("pointerup", onPointerUp);
      container.removeEventListener("pointercancel", onPointerUp);
    };
  }, [open, zoom, panX, panY]);

  if (!open || !anexo) return null;

  const canPrev = isPdf && page > 1;
  const canNext = isPdf && page < pageCount;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true">
      <div ref={modalRef} className="w-full max-w-6xl overflow-hidden rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between gap-3 border-b border-[#E5E7EB] px-4 py-3">
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold">{anexo.nomeArquivo}</div>
            <div className="text-xs text-[#6B7280]">
              {anexo.mimeType} • {fmtBytes(anexo.tamanhoBytes)} {isPdf ? `• Página ${page}/${pageCount}` : ""}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap justify-end">
            <button className="rounded-lg border border-[#D1D5DB] bg-white px-3 py-2 text-sm hover:bg-[#F9FAFB]" type="button" onClick={() => void fitToWindow()} disabled={loading}>
              Ajustar
            </button>
            <button
              className="rounded-lg border border-[#D1D5DB] bg-white px-3 py-2 text-sm hover:bg-[#F9FAFB]"
              type="button"
              onClick={() => {
                resetView();
              }}
              disabled={loading}
            >
              100%
            </button>
            <div className="rounded-lg border border-[#D1D5DB] bg-white px-3 py-2 text-sm text-[#111827]">
              Zoom {Math.round(zoom * 100)}%
            </div>
            <button className="rounded-lg border border-[#D1D5DB] bg-white px-3 py-2 text-sm hover:bg-[#F9FAFB]" type="button" onClick={() => void toggleFullscreen()} disabled={loading}>
              {isFullscreen ? "Sair Tela Cheia" : "Tela Cheia"}
            </button>
            <a className="rounded-lg border border-[#D1D5DB] bg-white px-3 py-2 text-sm hover:bg-[#F9FAFB]" href={`/api/v1/engenharia/projetos/anexos/${anexo.idAnexo}/download`} target="_blank" rel="noreferrer">
              Abrir
            </a>
            <button className="rounded-lg border border-[#D1D5DB] bg-white px-3 py-2 text-sm hover:bg-[#F9FAFB]" type="button" onClick={onClose} disabled={loading}>
              Fechar
            </button>
          </div>
        </div>

        <div className="grid gap-0 lg:grid-cols-[320px_1fr]">
          <div className="border-b border-[#E5E7EB] p-4 lg:border-b-0 lg:border-r">
            {err ? <div className="mb-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div> : null}

            <div className="space-y-3">
              <div className="text-sm font-semibold">Ferramentas</div>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" className={`rounded-lg border px-3 py-2 text-sm ${tool === "PEN" ? "border-[#2563EB]" : "border-[#D1D5DB]"} hover:bg-[#F9FAFB]`} onClick={() => setTool("PEN")} disabled={loading}>
                  Lápis
                </button>
                <button type="button" className={`rounded-lg border px-3 py-2 text-sm ${tool === "LINE" ? "border-[#2563EB]" : "border-[#D1D5DB]"} hover:bg-[#F9FAFB]`} onClick={() => setTool("LINE")} disabled={loading}>
                  Régua
                </button>
                <button type="button" className={`rounded-lg border px-3 py-2 text-sm ${tool === "HIGHLIGHT" ? "border-[#2563EB]" : "border-[#D1D5DB]"} hover:bg-[#F9FAFB]`} onClick={() => setTool("HIGHLIGHT")} disabled={loading}>
                  Tinta
                </button>
                <button type="button" className={`rounded-lg border px-3 py-2 text-sm ${tool === "ERASER" ? "border-[#2563EB]" : "border-[#D1D5DB]"} hover:bg-[#F9FAFB]`} onClick={() => setTool("ERASER")} disabled={loading}>
                  Borracha
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="text-xs text-[#6B7280]">Cor</div>
                  <input className="mt-1 h-10 w-full rounded-lg border border-[#D1D5DB] bg-white px-2" type="color" value={color} onChange={(e) => setColor(e.target.value)} disabled={loading || tool === "ERASER"} />
                </div>
                <div>
                  <div className="text-xs text-[#6B7280]">Espessura</div>
                  <input className="mt-1 w-full" type="range" min={1} max={14} value={width} onChange={(e) => setWidth(Number(e.target.value))} disabled={loading} />
                </div>
              </div>

              <div>
                <div className="text-xs text-[#6B7280]">Opacidade</div>
                <input className="mt-1 w-full" type="range" min={0.1} max={1} step={0.05} value={opacity} onChange={(e) => setOpacity(Number(e.target.value))} disabled={loading} />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  className="rounded-lg border border-[#D1D5DB] bg-white px-3 py-2 text-sm hover:bg-[#F9FAFB]"
                  onClick={() => {
                    const strokes = ensurePageStrokes(page);
                    strokes.pop();
                    redrawOverlay();
                  }}
                  disabled={loading}
                >
                  Desfazer
                </button>
                <button
                  type="button"
                  className="rounded-lg border border-[#D1D5DB] bg-white px-3 py-2 text-sm hover:bg-[#F9FAFB]"
                  onClick={() => {
                    annotRef.current.pages[getPageKey(page)] = [];
                    clearOverlay();
                  }}
                  disabled={loading}
                >
                  Limpar
                </button>
              </div>

              <button type="button" className="w-full rounded-lg bg-[#2563EB] px-4 py-2 text-sm text-white hover:bg-[#1D4ED8] disabled:opacity-50" onClick={salvarAnotacoes} disabled={loading}>
                Salvar rabiscos
              </button>

              {isPdf ? (
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" className="rounded-lg border border-[#D1D5DB] bg-white px-3 py-2 text-sm hover:bg-[#F9FAFB] disabled:opacity-50" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={loading || !canPrev}>
                    Página -
                  </button>
                  <button type="button" className="rounded-lg border border-[#D1D5DB] bg-white px-3 py-2 text-sm hover:bg-[#F9FAFB] disabled:opacity-50" onClick={() => setPage((p) => Math.min(pageCount, p + 1))} disabled={loading || !canNext}>
                    Página +
                  </button>
                </div>
              ) : null}
            </div>
          </div>

          <div className="p-4">
            <div ref={containerRef} className="relative h-[70vh] w-full overflow-hidden rounded-lg border border-[#E5E7EB] bg-[#F9FAFB] p-2">
              <div
                ref={contentRef}
                className="relative inline-block"
                style={{
                  transform: `translate(${panX}px, ${panY}px) scale(${zoom})`,
                  transformOrigin: "0 0",
                }}
              >
                <canvas ref={baseCanvasRef} className="block rounded" />
                <canvas ref={drawCanvasRef} className="absolute left-0 top-0 cursor-crosshair rounded" />
              </div>
              {loading ? <div className="absolute inset-0 flex items-center justify-center text-sm text-[#6B7280]">Carregando...</div> : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function VincularProfissionalModal(props: {
  open: boolean;
  onClose: () => void;
  idProjeto: number | null;
  onLinked: () => void;
}) {
  const { open, onClose, idProjeto, onLinked } = props;
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<TecnicoRow[]>([]);
  const [selectedIdTecnico, setSelectedIdTecnico] = useState<number | null>(null);
  const [tipo, setTipo] = useState<"RESPONSAVEL_TECNICO" | "FISCAL_OBRA">("RESPONSAVEL_TECNICO");
  const [abrangencia, setAbrangencia] = useState("");
  const [numeroDocumento, setNumeroDocumento] = useState("");
  const [observacao, setObservacao] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => {
      const hay = `${r.nome} ${r.tituloProfissional || ""} ${r.conselho || ""} ${r.numeroRegistro || ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [rows, query]);

  useEffect(() => {
    if (!open) return;
    let active = true;
    (async () => {
      try {
        setLoading(true);
        setErr(null);
        setQuery("");
        setSelectedIdTecnico(null);
        setTipo("RESPONSAVEL_TECNICO");
        setAbrangencia("");
        setNumeroDocumento("");
        setObservacao("");
        const res = await api.get("/api/v1/engenharia/tecnicos");
        const list = unwrapApiData<any[]>(res?.data || []);
        const mapped: TecnicoRow[] = Array.isArray(list)
          ? list.map((r) => ({
              idTecnico: Number(r.idTecnico),
              nome: String(r.nome || ""),
              tituloProfissional: r.tituloProfissional == null ? null : String(r.tituloProfissional),
              conselho: r.conselho == null ? null : String(r.conselho),
              numeroRegistro: r.numeroRegistro == null ? null : String(r.numeroRegistro),
            }))
          : [];
        if (!active) return;
        setRows(mapped.filter((r) => Number.isInteger(r.idTecnico) && r.idTecnico > 0));
      } catch (e: any) {
        if (active) setErr(e?.response?.data?.message || e?.message || "Erro ao carregar profissionais.");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [open]);

  async function vincular() {
    if (!idProjeto) {
      setErr("Salve o projeto antes de vincular profissionais.");
      return;
    }
    if (!selectedIdTecnico) {
      setErr("Selecione um profissional.");
      return;
    }
    try {
      setLoading(true);
      setErr(null);
      await api.post("/api/v1/engenharia/projetos/responsaveis", {
        idProjeto,
        idTecnico: selectedIdTecnico,
        tipo,
        abrangencia: abrangencia.trim() || null,
        numeroDocumento: numeroDocumento.trim() || null,
        observacao: observacao.trim() || null,
      });
      onLinked();
      onClose();
    } catch (e: any) {
      setErr(e?.response?.data?.message || e?.message || "Erro ao vincular profissional.");
    } finally {
      setLoading(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-4xl overflow-hidden rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between gap-3 border-b border-[#E5E7EB] px-4 py-3">
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold">Vincular profissional ao projeto</div>
            <div className="text-xs text-[#6B7280]">Selecione na lista e defina o tipo do vínculo.</div>
          </div>
          <button className="rounded-lg border border-[#D1D5DB] bg-white px-3 py-2 text-sm hover:bg-[#F9FAFB]" type="button" onClick={onClose} disabled={loading}>
            Fechar
          </button>
        </div>

        <div className="grid gap-0 lg:grid-cols-[1fr_320px]">
          <div className="border-b border-[#E5E7EB] p-4 lg:border-b-0 lg:border-r">
            {err ? <div className="mb-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div> : null}

            <input className="input" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Digite para filtrar profissionais..." disabled={loading} />

            <div className="mt-3 overflow-hidden rounded-lg border border-[#E5E7EB]">
              <div className="max-h-[52vh] overflow-auto">
                {!filtered.length ? (
                  <div className="px-3 py-4 text-sm text-[#6B7280]">{loading ? "Carregando..." : "Nenhum profissional encontrado."}</div>
                ) : (
                  filtered.map((r) => {
                    const selected = r.idTecnico === selectedIdTecnico;
                    return (
                      <button
                        key={r.idTecnico}
                        type="button"
                        className={`block w-full px-3 py-2 text-left hover:bg-[#F9FAFB] ${selected ? "bg-[#EFF6FF]" : ""}`}
                        onClick={() => setSelectedIdTecnico(r.idTecnico)}
                        disabled={loading}
                      >
                        <div className="text-sm font-medium">{r.nome || "—"}</div>
                        <div className="text-xs text-[#6B7280]">
                          {r.tituloProfissional ? `${r.tituloProfissional} • ` : ""}
                          {(r.conselho || "—") + " " + (r.numeroRegistro || "—")}
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          <div className="p-4">
            <div className="space-y-3">
              <div>
                <div className="text-sm text-[#6B7280]">Tipo do vínculo</div>
                <select className="input" value={tipo} onChange={(e) => setTipo((String(e.target.value).toUpperCase() === "FISCAL_OBRA" ? "FISCAL_OBRA" : "RESPONSAVEL_TECNICO") as any)} disabled={loading}>
                  <option value="RESPONSAVEL_TECNICO">Responsável Técnico</option>
                  <option value="FISCAL_OBRA">Fiscal da Obra</option>
                </select>
              </div>
              <div>
                <div className="text-sm text-[#6B7280]">Abrangência (opcional)</div>
                <input className="input" value={abrangencia} onChange={(e) => setAbrangencia(e.target.value)} placeholder="Ex.: Estrutural / Hidrossanitário / Obra inteira" disabled={loading} />
              </div>
              <div>
                <div className="text-sm text-[#6B7280]">Nº Documento (opcional)</div>
                <input className="input" value={numeroDocumento} onChange={(e) => setNumeroDocumento(e.target.value)} placeholder="ART / RRT / etc." disabled={loading} />
              </div>
              <div>
                <div className="text-sm text-[#6B7280]">Observação (opcional)</div>
                <textarea className="input min-h-[90px]" value={observacao} onChange={(e) => setObservacao(e.target.value)} placeholder="Observações sobre o vínculo" disabled={loading} />
              </div>

              <button type="button" className="w-full rounded-lg bg-[#2563EB] px-4 py-2 text-sm text-white hover:bg-[#1D4ED8] disabled:opacity-50" onClick={vincular} disabled={loading || !selectedIdTecnico}>
                Vincular ao projeto
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ProjetoFormClient() {
  const params = useParams<{ id?: string }>();
  const router = useRouter();
  const sp = useSearchParams();

  const idProjeto = useMemo(() => {
    const n = Number(params?.id || 0);
    return Number.isInteger(n) && n > 0 ? n : null;
  }, [params]);

  const returnTo = useMemo(() => safeInternalPath(sp.get("returnTo") || null), [sp]);
  const autoLink = String(sp.get("autoLink") || "") === "1";
  const obraIdToLink = useMemo(() => {
    const n = Number(sp.get("obraId") || 0);
    return Number.isInteger(n) && n > 0 ? n : null;
  }, [sp]);

  const backHref = returnTo || "/dashboard/engenharia/projetos";

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [titulo, setTitulo] = useState("");
  const [endereco, setEndereco] = useState("");
  const [tipo, setTipo] = useState<string>(TIPO_OPTIONS_BASE[0]);
  const [tipoQuery, setTipoQuery] = useState<string>(TIPO_OPTIONS_BASE[0]);
  const [tipoOptions, setTipoOptions] = useState<string[]>(TIPO_OPTIONS_BASE);
  const [tipoOpen, setTipoOpen] = useState(false);
  const [numeroProjeto, setNumeroProjeto] = useState("");
  const [revisao, setRevisao] = useState("");
  const [status, setStatus] = useState<string>(STATUS_OPTIONS[0].value);
  const [dataProjeto, setDataProjeto] = useState("");
  const [dataAprovacao, setDataAprovacao] = useState("");
  const [descricao, setDescricao] = useState("");

  const tipoFiltered = useMemo(() => {
    const q = tipoQuery.trim().toLowerCase();
    const base = tipoOptions;
    if (!q) return base;
    return base.filter((x) => x.toLowerCase().includes(q));
  }, [tipoOptions, tipoQuery]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("engenharia:tiposProjeto") || "";
      const parsed = JSON.parse(raw || "[]");
      const extra = Array.isArray(parsed) ? parsed.map((x) => String(x || "").trim()).filter(Boolean) : [];
      const merged = Array.from(new Set([...TIPO_OPTIONS_BASE, ...extra].map((x) => normalizeTipoLabel(x)))).filter(Boolean);
      setTipoOptions(merged);
    } catch {
      setTipoOptions(TIPO_OPTIONS_BASE);
    }
  }, []);

  function persistTipoOptions(next: string[]) {
    try {
      const extra = next.filter((x) => !TIPO_OPTIONS_BASE.includes(x));
      localStorage.setItem("engenharia:tiposProjeto", JSON.stringify(extra));
    } catch {}
  }

  function ensureTipoOption(value: string) {
    const normalized = normalizeTipoLabel(value);
    if (!normalized) return;
    setTipoOptions((prev) => {
      const next = Array.from(new Set([...prev, normalized]));
      persistTipoOptions(next);
      return next;
    });
  }

  const [respLoading, setRespLoading] = useState(false);
  const [respErr, setRespErr] = useState<string | null>(null);
  const [respRows, setRespRows] = useState<ProjetoResponsavelRow[]>([]);
  const [vincularOpen, setVincularOpen] = useState(false);

  const [anexosLoading, setAnexosLoading] = useState(false);
  const [anexosErr, setAnexosErr] = useState<string | null>(null);
  const [anexosRows, setAnexosRows] = useState<ProjetoAnexoRow[]>([]);
  const [anexosUpload, setAnexosUpload] = useState<File[]>([]);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerAnexo, setViewerAnexo] = useState<ProjetoAnexoRow | null>(null);

  useEffect(() => {
    if (!idProjeto) return;
    let active = true;
    (async () => {
      try {
        setLoading(true);
        setErr(null);
        const res = await api.get(`/api/v1/engenharia/projetos/${idProjeto}`);
        const d = unwrapApiData<any>(res?.data || null) as any;
        if (!active) return;
        const dto: ProjetoDTO = {
          idProjeto: Number(d.idProjeto),
          titulo: String(d.titulo || ""),
          endereco: d.endereco == null ? null : String(d.endereco),
          descricao: d.descricao == null ? null : String(d.descricao),
          tipo: d.tipo == null ? null : String(d.tipo),
          numeroProjeto: d.numeroProjeto == null ? null : String(d.numeroProjeto),
          revisao: d.revisao == null ? null : String(d.revisao),
          status: d.status == null ? null : String(d.status),
          dataProjeto: d.dataProjeto == null ? null : String(d.dataProjeto),
          dataAprovacao: d.dataAprovacao == null ? null : String(d.dataAprovacao),
        };
        setTitulo(dto.titulo);
        setEndereco(dto.endereco || "");
        setTipo(dto.tipo || TIPO_OPTIONS_BASE[0]);
        setTipoQuery(dto.tipo || TIPO_OPTIONS_BASE[0]);
        setNumeroProjeto(dto.numeroProjeto || "");
        setRevisao(dto.revisao || "");
        setStatus(dto.status || STATUS_OPTIONS[0].value);
        setDataProjeto(dto.dataProjeto ? String(dto.dataProjeto).slice(0, 10) : "");
        setDataAprovacao(dto.dataAprovacao ? String(dto.dataAprovacao).slice(0, 10) : "");
        setDescricao(dto.descricao || "");
      } catch (e: any) {
        if (active) setErr(e?.response?.data?.message || e?.message || "Erro ao carregar projeto.");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [idProjeto]);

  async function carregarResponsaveisProjeto() {
    if (!idProjeto) return;
    try {
      setRespLoading(true);
      setRespErr(null);
      const res = await api.get(`/api/v1/engenharia/projetos/responsaveis?idProjeto=${idProjeto}`);
      const list = unwrapApiData<any[]>(res?.data || []);
      const mapped: ProjetoResponsavelRow[] = Array.isArray(list)
        ? list.map((r) => ({
            idProjetoResponsavel: Number(r.idProjetoResponsavel),
            idProjeto: Number(r.idProjeto),
            idTecnico: Number(r.idTecnico),
            nome: String(r.nome || ""),
            conselho: r.conselho == null ? null : String(r.conselho),
            numeroRegistro: r.numeroRegistro == null ? null : String(r.numeroRegistro),
            tipo: (String(r.tipo || "").toUpperCase() === "FISCAL_OBRA" ? "FISCAL_OBRA" : "RESPONSAVEL_TECNICO") as any,
            abrangencia: r.abrangencia == null ? null : String(r.abrangencia),
            numeroDocumento: r.numeroDocumento == null ? null : String(r.numeroDocumento),
            observacao: r.observacao == null ? null : String(r.observacao),
          }))
        : [];
      setRespRows(mapped);
    } catch (e: any) {
      setRespErr(e?.response?.data?.message || e?.message || "Erro ao carregar responsáveis do projeto.");
    } finally {
      setRespLoading(false);
    }
  }

  useEffect(() => {
    if (!idProjeto) return;
    carregarResponsaveisProjeto();
  }, [idProjeto]);

  async function carregarAnexosProjeto(pid?: number | null) {
    const id = typeof pid === "number" ? pid : idProjeto;
    if (!id) return;
    try {
      setAnexosLoading(true);
      setAnexosErr(null);
      const res = await api.get(`/api/v1/engenharia/projetos/${id}/anexos`);
      const list = unwrapApiData<any[]>(res?.data || []);
      const mapped: ProjetoAnexoRow[] = Array.isArray(list)
        ? list.map((r) => ({
            idAnexo: Number(r.idAnexo),
            nomeArquivo: String(r.nomeArquivo || ""),
            mimeType: String(r.mimeType || ""),
            tamanhoBytes: Number(r.tamanhoBytes || 0),
            criadoEm: String(r.criadoEm || ""),
            atualizadoEm: String(r.atualizadoEm || ""),
            possuiAnotacoes: Boolean(r.possuiAnotacoes),
          }))
        : [];
      setAnexosRows(mapped);
    } catch (e: any) {
      setAnexosErr(e?.response?.data?.message || e?.message || "Erro ao carregar anexos.");
    } finally {
      setAnexosLoading(false);
    }
  }

  useEffect(() => {
    if (!idProjeto) return;
    carregarAnexosProjeto(idProjeto);
  }, [idProjeto]);

  async function uploadAnexosProjeto(pid: number, files: File[]) {
    for (const f of files) {
      const fd = new FormData();
      fd.append("file", f);
      await api.post(`/api/v1/engenharia/projetos/${pid}/anexos`, fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
    }
  }

  async function enviarAnexosAgora() {
    if (!idProjeto) {
      setAnexosErr("Salve o projeto antes de anexar arquivos.");
      return;
    }
    if (!anexosUpload.length) return;
    try {
      setAnexosLoading(true);
      setAnexosErr(null);
      await uploadAnexosProjeto(idProjeto, anexosUpload);
      setAnexosUpload([]);
      await carregarAnexosProjeto(idProjeto);
      alert("Anexos enviados.");
    } catch (e: any) {
      setAnexosErr(e?.response?.data?.message || e?.message || "Erro ao enviar anexos.");
    } finally {
      setAnexosLoading(false);
    }
  }

  async function adicionarResponsavelProjeto() {
    if (!idProjeto) {
      setErr("Salve o projeto antes de cadastrar responsáveis.");
      return;
    }
    setRespErr(null);
    setVincularOpen(true);
  }

  async function editarResponsavelProjeto(r: ProjetoResponsavelRow) {
    try {
      setRespLoading(true);
      setRespErr(null);
      const tipo = (prompt("Tipo (RESPONSAVEL_TECNICO / FISCAL_OBRA):", r.tipo) || r.tipo).trim().toUpperCase();
      const abrangencia = (prompt("Abrangência:", r.abrangencia || "") || "").trim() || null;
      const numeroDocumento = (prompt("Nº documento:", r.numeroDocumento || "") || "").trim() || null;
      const observacao = (prompt("Observação:", r.observacao || "") || "").trim() || null;
      await api.put(`/api/v1/engenharia/projetos/responsaveis/${r.idProjetoResponsavel}`, {
        tipo,
        abrangencia,
        numeroDocumento,
        observacao,
      });
      await carregarResponsaveisProjeto();
    } catch (e: any) {
      setRespErr(e?.response?.data?.message || e?.message || "Erro ao editar responsável.");
    } finally {
      setRespLoading(false);
    }
  }

  async function removerResponsavelProjeto(r: ProjetoResponsavelRow) {
    if (!confirm(`Remover "${r.nome}" do projeto?`)) return;
    try {
      setRespLoading(true);
      setRespErr(null);
      await api.delete(`/api/v1/engenharia/projetos/responsaveis/${r.idProjetoResponsavel}`);
      await carregarResponsaveisProjeto();
    } catch (e: any) {
      setRespErr(e?.response?.data?.message || e?.message || "Erro ao remover responsável.");
    } finally {
      setRespLoading(false);
    }
  }

  async function salvar() {
    const t = titulo.trim();
    const e = endereco.trim();
    if (!t) {
      setErr("Título do projeto é obrigatório.");
      return;
    }
    if (!e) {
      setErr("Endereço é obrigatório.");
      return;
    }

    try {
      setLoading(true);
      setErr(null);
      const payload = {
        titulo: t,
        endereco: e,
        tipo: tipo.trim() || null,
        numeroProjeto: numeroProjeto.trim() || null,
        revisao: revisao.trim() || null,
        status: status.trim() || null,
        dataProjeto: dataProjeto.trim() || null,
        dataAprovacao: dataAprovacao.trim() || null,
        descricao: descricao.trim() || null,
      };

      if (idProjeto) {
        await api.put(`/api/v1/engenharia/projetos/${idProjeto}`, payload);
        if (anexosUpload.length) {
          await uploadAnexosProjeto(idProjeto, anexosUpload);
          setAnexosUpload([]);
        }
        router.push(backHref);
        return;
      }

      const res = await api.post("/api/v1/engenharia/projetos", payload);
      const out = unwrapApiData<any>(res?.data || null) as any;
      const newId = Number(out?.idProjeto || 0);
      if (Number.isInteger(newId) && newId > 0 && anexosUpload.length) {
        try {
          await uploadAnexosProjeto(newId, anexosUpload);
          setAnexosUpload([]);
        } catch {
          alert("Projeto salvo, mas houve erro ao enviar anexos. Abra o projeto e tente novamente.");
          router.push(`/dashboard/engenharia/projetos/${newId}?returnTo=${encodeURIComponent(backHref)}`);
          return;
        }
      }
      if (autoLink && obraIdToLink && Number.isInteger(newId) && newId > 0) {
        await api.post("/api/v1/engenharia/obras/projetos", { idObra: obraIdToLink, idProjeto: newId });
        const importar = confirm("Deseja importar responsáveis do projeto para a obra agora?");
        if (importar) {
          await api.post("/api/v1/engenharia/obras/responsabilidades/importar", { idObra: obraIdToLink, idProjeto: newId });
        }
        router.push(backHref);
        return;
      }

      if (Number.isInteger(newId) && newId > 0) {
        router.push(`/dashboard/engenharia/projetos/${newId}?returnTo=${encodeURIComponent(backHref)}`);
        return;
      }

      router.push(backHref);
    } catch (e: any) {
      setErr(e?.response?.data?.message || e?.message || "Erro ao salvar.");
    } finally {
      setLoading(false);
    }
  }

  const breadcrumb = useMemo(() => {
    const base = idProjeto ? "Cadastro de Projeto (editar)" : "Cadastro de Projeto (novo)";
    if (!returnTo) return `Engenharia → Projetos → ${base}`;
    const rt = returnTo.toLowerCase();
    if (/\/dashboard\/engenharia\/obras\/\d+\/projetos/.test(rt)) return `Engenharia → Obras → Obra selecionada → Projetos da Obra → ${base}`;
    if (/\/dashboard\/engenharia\/obras\/\d+/.test(rt)) return `Engenharia → Obras → Obra selecionada → ${base}`;
    if (rt.includes("/dashboard/engenharia/obras")) return `Engenharia → Obras → ${base}`;
    if (rt.includes("/dashboard/engenharia/projetos")) return `Engenharia → Projetos → ${base}`;
    return `Engenharia → Projetos → ${base}`;
  }, [idProjeto, returnTo]);

  return (
    <div className="p-6 space-y-6 max-w-5xl text-[#111827]">
      <AnexoViewerModal
        open={viewerOpen}
        anexo={viewerAnexo}
        onClose={() => {
          setViewerOpen(false);
          setViewerAnexo(null);
        }}
        onSaved={() => carregarAnexosProjeto(idProjeto)}
      />
      <VincularProfissionalModal
        open={vincularOpen}
        idProjeto={idProjeto}
        onClose={() => setVincularOpen(false)}
        onLinked={() => carregarResponsaveisProjeto()}
      />
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="text-xs text-[#6B7280]">{breadcrumb}</div>
          <h1 className="text-2xl font-semibold">{idProjeto ? "Cadastro de Projeto" : "Cadastro de Projeto"}</h1>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button className="rounded-lg border border-[#D1D5DB] bg-white px-4 py-2 text-sm hover:bg-[#F9FAFB]" type="button" onClick={() => router.push(backHref)} disabled={loading}>
            Voltar
          </button>
          <button className="rounded-lg bg-[#2563EB] px-4 py-2 text-sm text-white hover:bg-[#1D4ED8]" type="button" onClick={salvar} disabled={loading}>
            Salvar
          </button>
        </div>
      </div>

      {err ? <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{err}</div> : null}

      <div className="rounded-xl border border-[#E5E7EB] bg-white shadow-sm">
        <div className="border-b border-[#E5E7EB] px-4 py-3 font-medium">Dados do Projeto</div>
        <div className="p-4 space-y-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="md:col-span-2">
              <div className="text-sm text-[#6B7280]">Título do Projeto *</div>
              <input className="input" value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ex.: Projeto Hidrossanitário - Residencial Porto Seguro" />
            </div>
            <div className="md:col-span-2">
              <div className="text-sm text-[#6B7280]">Endereço *</div>
              <input className="input" value={endereco} onChange={(e) => setEndereco(e.target.value)} placeholder="Rua, nº, bairro, cidade/UF" />
            </div>
            <div>
              <div className="text-sm text-[#6B7280]">Tipo de Projeto *</div>
              <div className="relative">
                <input
                  className="input"
                  value={tipoQuery}
                  onChange={(e) => {
                    const v = e.target.value;
                    setTipoQuery(v);
                    setTipo(v);
                    setTipoOpen(true);
                  }}
                  onFocus={() => setTipoOpen(true)}
                  onBlur={() => {
                    const finalValue = normalizeTipoLabel(tipoQuery);
                    if (finalValue) {
                      setTipo(finalValue);
                      setTipoQuery(finalValue);
                      ensureTipoOption(finalValue);
                    }
                    setTimeout(() => setTipoOpen(false), 120);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      const finalValue = normalizeTipoLabel(tipoQuery);
                      if (finalValue) {
                        setTipo(finalValue);
                        setTipoQuery(finalValue);
                        ensureTipoOption(finalValue);
                        setTipoOpen(false);
                      }
                    }
                    if (e.key === "Escape") setTipoOpen(false);
                  }}
                  placeholder="Digite para filtrar ou adicionar..."
                />
                {tipoOpen && tipoFiltered.length ? (
                  <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border border-[#E5E7EB] bg-white shadow-sm">
                    <div className="max-h-56 overflow-auto">
                      {tipoFiltered.slice(0, 30).map((x) => (
                        <button
                          key={x}
                          type="button"
                          className={`block w-full px-3 py-2 text-left text-sm hover:bg-[#F9FAFB] ${x === tipo ? "bg-[#F9FAFB]" : ""}`}
                          onMouseDown={(ev) => ev.preventDefault()}
                          onClick={() => {
                            setTipo(x);
                            setTipoQuery(x);
                            ensureTipoOption(x);
                            setTipoOpen(false);
                          }}
                        >
                          {x}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
            <div>
              <div className="text-sm text-[#6B7280]">Nº do Projeto</div>
              <input className="input" value={numeroProjeto} onChange={(e) => setNumeroProjeto(e.target.value)} placeholder="Ex.: PH-2024-001" />
            </div>
            <div>
              <div className="text-sm text-[#6B7280]">Revisão</div>
              <input className="input" value={revisao} onChange={(e) => setRevisao(e.target.value)} placeholder="Ex.: 01" />
            </div>
            <div>
              <div className="text-sm text-[#6B7280]">Status *</div>
              <select className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
                {STATUS_OPTIONS.map((x) => (
                  <option key={x.value} value={x.value}>
                    {x.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <div className="text-sm text-[#6B7280]">Data do Projeto</div>
              <input className="input" type="date" value={dataProjeto} onChange={(e) => setDataProjeto(e.target.value)} />
            </div>
            <div>
              <div className="text-sm text-[#6B7280]">Data de Aprovação</div>
              <input className="input" type="date" value={dataAprovacao} onChange={(e) => setDataAprovacao(e.target.value)} />
            </div>
            <div className="md:col-span-2">
              <div className="text-sm text-[#6B7280]">Descrição / Observações</div>
              <textarea className="input min-h-[110px]" value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Observações, escopo, etc." />
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-[#E5E7EB] bg-white shadow-sm">
        <div className="border-b border-[#E5E7EB] px-4 py-3 font-medium">Anexos (PDF / Imagem)</div>
        <div className="p-4 space-y-3">
          {anexosErr ? <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{anexosErr}</div> : null}

          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="text-sm text-[#6B7280]">{idProjeto ? "Envie arquivos e visualize/anote no botão Visualizar." : "Salve o projeto para anexar arquivos."}</div>
            <button className="rounded-lg border border-[#D1D5DB] bg-white px-3 py-2 text-sm hover:bg-[#F9FAFB]" type="button" onClick={() => carregarAnexosProjeto(idProjeto)} disabled={!idProjeto || anexosLoading}>
              Atualizar
            </button>
          </div>

          <div className="grid gap-2 md:grid-cols-[1fr_auto]">
            <input
              type="file"
              accept="application/pdf,image/*"
              multiple
              className="block w-full text-sm"
              disabled={!idProjeto || anexosLoading || loading}
              onChange={(e) => {
                const list = e.target.files ? Array.from(e.target.files) : [];
                setAnexosUpload(list);
              }}
            />
            <button className="rounded-lg bg-[#2563EB] px-4 py-2 text-sm text-white hover:bg-[#1D4ED8] disabled:opacity-50" type="button" onClick={enviarAnexosAgora} disabled={!idProjeto || anexosLoading || !anexosUpload.length}>
              Enviar
            </button>
          </div>

          {anexosUpload.length ? (
            <div className="text-xs text-[#6B7280]">
              Selecionados: {anexosUpload.map((f) => `${f.name} (${fmtBytes(f.size)})`).join(" • ")}
            </div>
          ) : null}

          <div className="overflow-hidden rounded-lg border border-[#E5E7EB]">
            <div className="grid grid-cols-[1fr_140px] gap-0 bg-[#F9FAFB] px-3 py-2 text-xs font-semibold text-[#6B7280]">
              <div>Arquivo</div>
              <div className="text-right">Ações</div>
            </div>
            <div className="divide-y">
              {!anexosRows.length ? (
                <div className="px-3 py-3 text-sm text-[#6B7280]">{idProjeto ? (anexosLoading ? "Carregando..." : "Nenhum anexo ainda.") : "—"}</div>
              ) : (
                anexosRows.map((a) => (
                  <div key={a.idAnexo} className="grid grid-cols-[1fr_140px] gap-0 px-3 py-2">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">{a.nomeArquivo}</div>
                      <div className="mt-0.5 text-xs text-[#6B7280]">
                        {a.mimeType} • {fmtBytes(a.tamanhoBytes)} {a.possuiAnotacoes ? "• com rabiscos" : ""}
                      </div>
                    </div>
                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        className="rounded-lg border border-[#D1D5DB] bg-white px-3 py-1.5 text-sm hover:bg-[#F9FAFB]"
                        onClick={() => {
                          setViewerAnexo(a);
                          setViewerOpen(true);
                        }}
                      >
                        Visualizar
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-[#E5E7EB] bg-white shadow-sm">
        <div className="border-b border-[#E5E7EB] px-4 py-3 font-medium">Responsáveis Técnicos / Fiscais do Projeto</div>
        <div className="p-4 space-y-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex gap-2 flex-wrap">
              <button
                className="rounded-lg border border-[#D1D5DB] bg-white px-3 py-2 text-sm hover:bg-[#F9FAFB]"
                type="button"
                onClick={carregarResponsaveisProjeto}
                disabled={respLoading || !idProjeto}
              >
                Atualizar
              </button>
              <button className="rounded-lg bg-[#2563EB] px-3 py-2 text-sm text-white hover:bg-[#1D4ED8] disabled:opacity-50" type="button" onClick={adicionarResponsavelProjeto} disabled={respLoading || !idProjeto}>
                Adicionar profissional ao projeto
              </button>
              <button
                className="rounded-lg border border-[#D1D5DB] bg-white px-3 py-2 text-sm hover:bg-[#F9FAFB]"
                type="button"
                onClick={() => router.push(`/dashboard/engenharia/profissionais?returnTo=${encodeURIComponent(`/dashboard/engenharia/projetos/${idProjeto || "novo"}?returnTo=${encodeURIComponent(backHref)}`)}`)}
              >
                Abrir Profissionais
              </button>
            </div>
            {!idProjeto ? <div className="text-sm text-[#6B7280]">Salve o projeto para habilitar.</div> : null}
          </div>

          {respErr ? <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{respErr}</div> : null}

          <div className="overflow-auto rounded-lg border">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-slate-700">
                <tr>
                  <th className="px-3 py-2">Técnico</th>
                  <th className="px-3 py-2">Conselho</th>
                  <th className="px-3 py-2">Registro</th>
                  <th className="px-3 py-2">Tipo</th>
                  <th className="px-3 py-2">Abrangência</th>
                  <th className="px-3 py-2">Nº Doc</th>
                  <th className="px-3 py-2 text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {respLoading ? (
                  <tr>
                    <td className="px-3 py-6 text-center text-slate-500" colSpan={7}>
                      Carregando...
                    </td>
                  </tr>
                ) : respRows.length ? (
                  respRows.map((r) => (
                    <tr key={r.idProjetoResponsavel} className="border-t">
                      <td className="px-3 py-2 font-medium">{r.nome || "—"}</td>
                      <td className="px-3 py-2">{r.conselho || "—"}</td>
                      <td className="px-3 py-2">{r.numeroRegistro || "—"}</td>
                      <td className="px-3 py-2">{r.tipo === "FISCAL_OBRA" ? "Fiscal" : "Responsável Técnico"}</td>
                      <td className="px-3 py-2">{r.abrangencia || "—"}</td>
                      <td className="px-3 py-2">{r.numeroDocumento || "—"}</td>
                      <td className="px-3 py-2 text-right whitespace-nowrap">
                        <button className="rounded-lg border bg-white px-2 py-1 text-xs hover:bg-slate-50" type="button" onClick={() => editarResponsavelProjeto(r)} disabled={respLoading}>
                          Editar
                        </button>{" "}
                        <button
                          className="rounded-lg border border-red-200 bg-white px-2 py-1 text-xs text-red-700 hover:bg-red-50"
                          type="button"
                          onClick={() => removerResponsavelProjeto(r)}
                          disabled={respLoading}
                        >
                          Remover
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td className="px-3 py-6 text-center text-slate-500" colSpan={7}>
                      Nenhum vínculo cadastrado.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
