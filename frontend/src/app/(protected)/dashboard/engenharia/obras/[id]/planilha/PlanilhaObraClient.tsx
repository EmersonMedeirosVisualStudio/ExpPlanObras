"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Download, Check, Printer, FileSpreadsheet, Pencil, Trash2, XCircle, TriangleAlert, Image } from "lucide-react";
import { PageLoadStatusBadge } from "@/components/PageLoadStatus";

type ComposicaoItem = {
  idItemBase: number;
  etapa: string | null;
  tipoItem: string;
  codigoItem: string;
  quantidade: number | null;
  perdaPercentual: number;
  codigoCentroCusto: string | null;
  codigoCentroCustoBase: string | null;
};

type CentroCustoOption = { codigo: string; descricao: string };

type VersaoRow = {
  idPlanilha: number;
  numeroVersao: number;
  nome: string;
  atual: boolean;
  idFonteDados: number | null;
  idParametros: number | null;
  fonteNome: string;
  parametrosNome: string;
  valorTotal: number;
  totalServicos: number;
};

type PlanilhaLinha = {
  idLinha: number;
  ordem: number;
  item: string;
  codigo: string;
  fonte: string;
  servicos: string;
  und: string;
  quant: string;
  valorUnitario: string;
  valorParcial: string;
  nivel: number;
  tipoLinha: "ITEM" | "SUBITEM" | "SERVICO";
};

type Planilha = {
  idPlanilha: number;
  numeroVersao: number;
  nome: string;
  atual: boolean;
  idFonteDados: number | null;
  idParametros: number | null;
  fonteNome: string;
  parametrosNome: string;
  parametros: {
    nome: string | null;
    dataBaseSbc: string | null;
    dataBaseSinapi: string | null;
    ufSinapi: string | null;
    bdiServicosSbc: number | null;
    bdiServicosSinapi: number | null;
    bdiDiferenciadoSbc: number | null;
    bdiDiferenciadoSinapi: number | null;
    encSociaisSemDesSbc: number | null;
    encSociaisSemDesSinapi: number | null;
    descontoSbc: number | null;
    descontoSinapi: number | null;
  };
  servicosPlanilha: Array<{ codigo: string; servicos: string; fonte: string; und: string }>;
  linhas: PlanilhaLinha[];
};

type ComposicaoValidacaoRow = {
  codigoServico: string;
  servico: string;
  totalPlanilha: number;
  totalComposicao: number;
  diff: number;
  status: "SEM_COMPOSICAO" | "DIVERGENTE" | "OK";
  qtdItens: number;
};

type FonteDadosDTO = {
  idFonteDados: number;
  nome: string;
  tipo: string;
  uf: string;
  dataBase: string;
  tipoPreco: string;
};

type ParametroDTO = {
  idParametros: number;
  nome: string;
  ufSinapi: string;
  dataBaseSbc: string;
  dataBaseSinapi: string;
  bdiServicosSbc: number | null;
  bdiServicosSinapi: number | null;
  bdiDiferenciadoSbc: number | null;
  bdiDiferenciadoSinapi: number | null;
  encSociaisSemDesSbc: number | null;
  encSociaisSemDesSinapi: number | null;
  descontoSbc: number | null;
  descontoSinapi: number | null;
};

function moeda(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function parseNumberLoose(v: unknown) {
  const raw = String(v ?? "").trim();
  if (!raw) return null;
  const cleaned = raw.replace(/[^\d,.\-]/g, "");
  if (!cleaned) return null;
  if (cleaned.includes(",") && cleaned.includes(".")) {
    if (cleaned.lastIndexOf(",") > cleaned.lastIndexOf(".")) {
      const n = Number(cleaned.replace(/\./g, "").replace(",", "."));
      return Number.isFinite(n) ? n : null;
    }
    const n = Number(cleaned.replace(/,/g, ""));
    return Number.isFinite(n) ? n : null;
  }
  if (cleaned.includes(",")) {
    const n = Number(cleaned.replace(",", "."));
    return Number.isFinite(n) ? n : null;
  }
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function escapeHtml(v: unknown) {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function normalizeHeader(h: string) {
  return String(h || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function parseCsvTextAuto(text: string) {
  const cleaned = String(text || "")
    .replace(/^\uFEFF/, "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");
  const lines = cleaned
    .split("\n")
    .map((l) => l.trimEnd())
    .filter((l) => l.trim().length > 0);
  if (!lines.length) return { headers: [] as string[], rows: [] as string[][] };
  const first = lines[0];
  const comma = (first.match(/,/g) || []).length;
  const semi = (first.match(/;/g) || []).length;
  const tab = (first.match(/\t/g) || []).length;
  const sep = tab > semi && tab > comma ? "\t" : semi > comma ? ";" : ",";
  const split = (line: string) => {
    const out: string[] = [];
    let cur = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === '"') {
          const next = line[i + 1];
          if (next === '"') {
            cur += '"';
            i++;
          } else {
            inQuotes = false;
          }
        } else {
          cur += ch;
        }
        continue;
      }
      if (ch === '"') {
        inQuotes = true;
        continue;
      }
      if (ch === sep) {
        out.push(cur);
        cur = "";
        continue;
      }
      cur += ch;
    }
    out.push(cur);
    return out.map((v) => v.trim());
  };
  const headers = split(lines[0]);
  const rows = lines.slice(1).map((l) => split(l));
  return { headers, rows };
}

async function readTextSmart(file: File) {
  const buf = await file.arrayBuffer();
  const utf8 = new TextDecoder("utf-8").decode(buf);
  const win1252 = new TextDecoder("windows-1252").decode(buf);
  const score = (t: string) => {
    const replacement = (t.match(/\uFFFD/g) || []).length;
    const mojibake = (t.match(/[ÃÂ]/g) || []).length;
    return replacement * 10 + mojibake;
  };
  return score(utf8) <= score(win1252) ? utf8 : win1252;
}

function toDec(v: unknown) {
  return parseNumberLoose(v);
}

function detectTipoLinha(item: string, codigo: string, und: string, quant: string, valorUnit: string) {
  const hasServ = !!(codigo.trim() || und.trim() || quant.trim() || valorUnit.trim());
  if (hasServ) return { tipo: "SERVICO" as const, nivel: item.trim() ? Math.max(0, item.split(".").filter(Boolean).length) : 0 };
  const parts = item.trim() ? item.split(".").filter(Boolean) : [];
  if (parts.length <= 1) return { tipo: "ITEM" as const, nivel: parts.length };
  return { tipo: "SUBITEM" as const, nivel: parts.length };
}

type ObraResumo = {
  idObra: number;
  nome: string | null;
  status: string | null;
  tipo: string | null;
  contratoId: number | null;
  contratoNumero: string | null;
  valorPrevisto: number | null;
};

type EmpresaDocumentosLayout = {
  logoDataUrl: string | null;
  cabecalhoHtml: string | null;
  rodapeHtml: string | null;
  cabecalhoAlturaMm: number | null;
  rodapeAlturaMm: number | null;
  atualizadoEm: string | null;
};

function getUserPrefKey() {
  try {
    const raw = localStorage.getItem("user");
    const u = raw ? (JSON.parse(raw) as any) : null;
    const id = u?.id != null ? Number(u.id) : NaN;
    if (Number.isFinite(id) && id > 0) return `exp:planilha:prefs:${id}`;
  } catch {}
  return "exp:planilha:prefs";
}

function parseItemKey(itemRaw: unknown) {
  const item = String(itemRaw ?? "").trim();
  if (!item) return null;
  if (!/^[0-9]+(\.[0-9]+)*$/.test(item)) return null;
  const parts = item
    .split(".")
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => Number(p));
  if (!parts.length || parts.some((n) => !Number.isFinite(n))) return null;
  return parts;
}

function sortPlanilhaLinhasByItem<T extends { item: string; idLinha: number }>(rows: T[]) {
  return [...rows].sort((a, b) => {
    const ak = parseItemKey(a.item);
    const bk = parseItemKey(b.item);
    if (ak && bk) {
      const n = Math.max(ak.length, bk.length);
      for (let i = 0; i < n; i++) {
        const av = ak[i] ?? -1;
        const bv = bk[i] ?? -1;
        if (av !== bv) return av - bv;
      }
      return a.idLinha - b.idLinha;
    }
    if (ak && !bk) return -1;
    if (!ak && bk) return 1;
    const ai = String(a.item || "");
    const bi = String(b.item || "");
    const cmp = ai.localeCompare(bi);
    if (cmp) return cmp;
    return a.idLinha - b.idLinha;
  });
}

function SearchSelect({
  value,
  options,
  onChange,
  disabled,
  placeholder,
  inputClassName,
  onBlur,
}: {
  value: string;
  options: string[];
  onChange: (v: string) => void;
  disabled?: boolean;
  placeholder?: string;
  inputClassName?: string;
  onBlur?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState<number>(-1);

  const filtered = useMemo(() => {
    const q = String(value || "").trim().toLowerCase();
    const list = Array.isArray(options) ? options : [];
    if (!q) return list.slice(0, 80);
    const starts = [] as string[];
    const contains = [] as string[];
    for (const opt of list) {
      const s = String(opt || "");
      const sl = s.toLowerCase();
      if (sl.startsWith(q)) starts.push(s);
      else if (sl.includes(q)) contains.push(s);
      if (starts.length + contains.length >= 80) break;
    }
    return [...starts, ...contains];
  }, [options, value]);

  useEffect(() => {
    if (!open) setActiveIndex(-1);
  }, [open]);

  return (
    <div className="relative">
      <input
        className={inputClassName ? inputClassName : "input bg-white"}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onClick={() => setOpen(true)}
        onBlur={() => {
          setOpen(false);
          onBlur?.();
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            if (open) {
              e.preventDefault();
              e.stopPropagation();
              setOpen(false);
              return;
            }
            return;
          }
          if (e.key === "ArrowDown") {
            if (!open) setOpen(true);
            e.preventDefault();
            setActiveIndex((p) => Math.min(filtered.length - 1, Math.max(0, p + 1)));
            return;
          }
          if (e.key === "ArrowUp") {
            if (!open) setOpen(true);
            e.preventDefault();
            setActiveIndex((p) => Math.max(0, p - 1));
            return;
          }
          if (e.key === "Enter") {
            if (!open) return;
            const picked = activeIndex >= 0 ? filtered[activeIndex] : null;
            if (!picked) return;
            e.preventDefault();
            onChange(picked);
            setOpen(false);
          }
        }}
        disabled={disabled}
        placeholder={placeholder}
      />

      {open && filtered.length ? (
        <div className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-lg border bg-white shadow">
          {filtered.map((opt, idx) => (
            <button
              key={`${opt}:${idx}`}
              type="button"
              className={`block w-full text-left px-3 py-2 text-sm hover:bg-slate-50 ${idx === activeIndex ? "bg-slate-50" : ""}`}
              onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onChange(opt);
                setOpen(false);
              }}
              onMouseEnter={() => setActiveIndex(idx)}
            >
              {opt}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function buildLinhaFormErrorMessage(errors: Partial<Record<keyof PlanilhaLinha, string>>) {
  const labels: Partial<Record<keyof PlanilhaLinha, string>> = {
    tipoLinha: "Tipo",
    item: "ITEM",
    codigo: "CÓDIGO",
    fonte: "FONTE",
    servicos: "SERVIÇOS",
    und: "UND",
    quant: "QUANT.",
    valorUnitario: "VALOR UNIT.",
    valorParcial: "VALOR PARCIAL",
  };

  const entries = Object.entries(errors || {})
    .map(([k, v]) => {
      const key = k as keyof PlanilhaLinha;
      const label = labels[key] || String(k);
      const msg = String(v || "").trim();
      return msg ? `${label} (${msg})` : label;
    })
    .filter(Boolean);

  if (!entries.length) return "Não foi possível salvar. Verifique os campos do formulário.";
  const preview = entries.slice(0, 6).join(" • ");
  return `Não foi possível salvar. Corrija: ${preview}`;
}

export default function PlanilhaObraClient({
  idObra,
  returnTo,
  initialPlanilhaId,
}: {
  idObra: number;
  returnTo: string | null;
  initialPlanilhaId: number | null;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [bootLoading, setBootLoading] = useState(false);
  const [bootDone, setBootDone] = useState(false);
  const bootPendingRef = useRef(0);
  const [err, setErr] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [obraStatus, setObraStatus] = useState<string | null>(null);
  const [obraResumo, setObraResumo] = useState<ObraResumo | null>(null);
  const [empresaDocumentosLayout, setEmpresaDocumentosLayout] = useState<EmpresaDocumentosLayout | null>(null);
  const [versoes, setVersoes] = useState<VersaoRow[]>([]);
  const [planilha, setPlanilha] = useState<Planilha | null>(null);
  const [planilhaId, setPlanilhaId] = useState<number | null>(initialPlanilhaId);
  const [showPrintConfig, setShowPrintConfig] = useState(false);
  const [linhaFormErr, setLinhaFormErr] = useState<string | null>(null);

  const safeReturnTo = useMemo(() => {
    const raw = String(returnTo || "").trim();
    const isExternal = raw.startsWith("//") || /^(?:[a-z][a-z0-9+.-]*:)?\/\//i.test(raw) || /^[a-z][a-z0-9+.-]*:/i.test(raw);
    return raw && !isExternal ? raw : null;
  }, [returnTo]);

  const effectivePlanilhaId = useMemo(() => {
    if (planilhaId != null && Number.isFinite(Number(planilhaId)) && Number(planilhaId) > 0) return Number(planilhaId);
    const p = planilha?.idPlanilha != null ? Number(planilha.idPlanilha) : 0;
    if (Number.isFinite(p) && p > 0) return p;
    return null;
  }, [planilha?.idPlanilha, planilhaId]);

  const selfHref = useMemo(() => {
    const qs = new URLSearchParams();
    if (effectivePlanilhaId) qs.set("planilhaId", String(effectivePlanilhaId));
    if (safeReturnTo) qs.set("returnTo", safeReturnTo);
    const tail = qs.toString();
    return `/dashboard/engenharia/obras/${idObra}/planilha${tail ? `?${tail}` : ""}`;
  }, [effectivePlanilhaId, idObra, safeReturnTo]);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [importPreview, setImportPreview] = useState<{
    file: File | null;
    nomeVersao: string;
    rows: Array<{
      rowIndex: number;
      item: string;
      codigo: string;
      fonte: string;
      servicos: string;
      und: string;
      quant: string;
      valorUnitario: string;
      valorParcialCalc: number | null;
      tipoLinha: "ITEM" | "SUBITEM" | "SERVICO";
      nivel: number;
      errors: Partial<Record<"item" | "codigo" | "fonte" | "servicos" | "und" | "quant" | "valorUnitario", string>>;
    }>;
    missingColumns: string[];
  }>({ file: null, nomeVersao: "", rows: [], missingColumns: [] });
  const [importFonteId, setImportFonteId] = useState<string>("");
  const [importParametrosId, setImportParametrosId] = useState<string>("");

  const [uiPrefs, setUiPrefs] = useState<{
    fontSizePx: number;
    itemBg: string;
    subitemBg: string;
    print: {
      headerFontFamily: string;
      headerFontSizePx: number;
      headerFontWeight: "normal" | "semibold" | "bold";
      topToHeaderPx: number;
      headerToDadosPx: number;
      dadosToTabelaPx: number;
      includeEmpresaHeader: boolean;
    };
  }>({
    fontSizePx: 12,
    itemBg: "#F8FAFC",
    subitemBg: "#FFFFFF",
    print: {
      headerFontFamily: "Arial",
      headerFontSizePx: 11,
      headerFontWeight: "semibold",
      topToHeaderPx: 0,
      headerToDadosPx: 6,
      dadosToTabelaPx: 10,
      includeEmpresaHeader: true,
    },
  });

  const [novo, setNovo] = useState({
    tipoLinha: "SERVICO" as "ITEM" | "SUBITEM" | "SERVICO",
    item: "",
    codigo: "",
    fonte: "",
    servicos: "",
    und: "",
    quant: "",
    valorUnitario: "",
    valorParcial: "",
  });

  const [editingLinhaId, setEditingLinhaId] = useState<number | null>(null);
  const editSnapshotRef = useRef<{ editingLinhaId: number | null; novo: typeof novo } | null>(null);

  const [composicaoServicoCodes, setComposicaoServicoCodes] = useState<Set<string>>(new Set());
  const [composicaoValidacaoByCodigo, setComposicaoValidacaoByCodigo] = useState<Record<string, ComposicaoValidacaoRow>>({});

  const [linhaErrors, setLinhaErrors] = useState<Partial<Record<keyof typeof novo, string>>>({});
  const [somenteItens, setSomenteItens] = useState(false);
  const [collapsedPrefixes, setCollapsedPrefixes] = useState<Set<string>>(new Set());

  const [showParamsCard, setShowParamsCard] = useState(false);
  const [showPlanilhaCard, setShowPlanilhaCard] = useState(true);
  const [showAdicionarCard, setShowAdicionarCard] = useState(false);

  useEffect(() => {
    if (!effectivePlanilhaId) return;
    setShowParamsCard(false);
    if (!editingLinhaId) setShowAdicionarCard(false);
  }, [effectivePlanilhaId]);

  useEffect(() => {
    if (editingLinhaId && !showAdicionarCard) setShowAdicionarCard(true);
  }, [editingLinhaId, showAdicionarCard]);

  const [fontes, setFontes] = useState<FonteDadosDTO[]>([]);
  const [parametrosCad, setParametrosCad] = useState<ParametroDTO[]>([]);

  const [modalNovaPlanilhaOpen, setModalNovaPlanilhaOpen] = useState(false);
  const [modalNovaPlanilhaMode, setModalNovaPlanilhaMode] = useState<"NOVA" | "CLONAR">("NOVA");
  const [novaPlanilhaNome, setNovaPlanilhaNome] = useState("");
  const [novaPlanilhaFonteId, setNovaPlanilhaFonteId] = useState<string>("");
  const [novaPlanilhaParametrosId, setNovaPlanilhaParametrosId] = useState<string>("");
  const [novaPlanilhaClonarDeId, setNovaPlanilhaClonarDeId] = useState<string>("");

  const [modalEditarPlanilhaOpen, setModalEditarPlanilhaOpen] = useState(false);
  const [editarPlanilhaTarget, setEditarPlanilhaTarget] = useState<VersaoRow | null>(null);
  const [editarPlanilhaNome, setEditarPlanilhaNome] = useState("");
  const [editarPlanilhaNumeroVersao, setEditarPlanilhaNumeroVersao] = useState<string>("");
  const [editarPlanilhaFonteId, setEditarPlanilhaFonteId] = useState<string>("");
  const [editarPlanilhaParametrosId, setEditarPlanilhaParametrosId] = useState<string>("");

  const [modalClonarPlanilhaOpen, setModalClonarPlanilhaOpen] = useState(false);
  const [clonarTarget, setClonarTarget] = useState<VersaoRow | null>(null);
  const [clonarIncludeParametros, setClonarIncludeParametros] = useState(false);
  const [clonarIncludeFonte, setClonarIncludeFonte] = useState(false);

  const paramsSectionRef = useRef<HTMLDivElement | null>(null);
  const planilhaSectionRef = useRef<HTMLDivElement | null>(null);
  const adicionarLinhaRef = useRef<HTMLDivElement | null>(null);

  const podeEditar = useMemo(() => {
    return true;
  }, []);

  function scrollToRef(ref: { current: HTMLDivElement | null }) {
    window.requestAnimationFrame(() => {
      ref.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  function toggleCollapsedPrefix(prefix: string) {
    const key = String(prefix || "").trim();
    if (!key) return;
    setCollapsedPrefixes((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  useEffect(() => {
    try {
      const key = getUserPrefKey();
      const raw = localStorage.getItem(key);
      if (!raw) return;
      const parsed = JSON.parse(raw) as any;
      const fontSizePx = parsed?.fontSizePx != null ? Number(parsed.fontSizePx) : NaN;
      const itemBg = typeof parsed?.itemBg === "string" ? String(parsed.itemBg) : "";
      const subitemBg = typeof parsed?.subitemBg === "string" ? String(parsed.subitemBg) : "";
      const pf = parsed?.print || {};
      const headerFontFamily = typeof pf?.headerFontFamily === "string" && String(pf.headerFontFamily).trim() ? String(pf.headerFontFamily).trim() : "";
      const headerFontSizePx = pf?.headerFontSizePx != null ? Number(pf.headerFontSizePx) : NaN;
      const headerFontWeightRaw = String(pf?.headerFontWeight || "").trim().toLowerCase();
      const headerFontWeight = headerFontWeightRaw === "bold" ? "bold" : headerFontWeightRaw === "normal" ? "normal" : "semibold";
      const topToHeaderPx = pf?.topToHeaderPx != null ? Number(pf.topToHeaderPx) : NaN;
      const headerToDadosPx = pf?.headerToDadosPx != null ? Number(pf.headerToDadosPx) : NaN;
      const dadosToTabelaPx = pf?.dadosToTabelaPx != null ? Number(pf.dadosToTabelaPx) : NaN;
      const includeEmpresaHeader = pf?.includeEmpresaHeader;
      setUiPrefs((p) => ({
        fontSizePx: Number.isFinite(fontSizePx) && fontSizePx >= 10 && fontSizePx <= 22 ? fontSizePx : p.fontSizePx,
        itemBg: itemBg && itemBg.startsWith("#") ? itemBg : p.itemBg,
        subitemBg: subitemBg && subitemBg.startsWith("#") ? subitemBg : p.subitemBg,
        print: {
          headerFontFamily: headerFontFamily || p.print.headerFontFamily,
          headerFontSizePx: Number.isFinite(headerFontSizePx) && headerFontSizePx >= 8 && headerFontSizePx <= 16 ? headerFontSizePx : p.print.headerFontSizePx,
          headerFontWeight,
          topToHeaderPx: Number.isFinite(topToHeaderPx) ? Math.max(0, Math.min(80, Math.round(topToHeaderPx))) : p.print.topToHeaderPx,
          headerToDadosPx: Number.isFinite(headerToDadosPx) ? Math.max(0, Math.min(80, Math.round(headerToDadosPx))) : p.print.headerToDadosPx,
          dadosToTabelaPx: Number.isFinite(dadosToTabelaPx) ? Math.max(0, Math.min(120, Math.round(dadosToTabelaPx))) : p.print.dadosToTabelaPx,
          includeEmpresaHeader: typeof includeEmpresaHeader === "boolean" ? includeEmpresaHeader : p.print.includeEmpresaHeader,
        },
      }));
    } catch {}
  }, []);

  useEffect(() => {
    try {
      const key = getUserPrefKey();
      localStorage.setItem(key, JSON.stringify(uiPrefs));
    } catch {}
  }, [uiPrefs]);

  const breadcrumb = useMemo(() => {
    const base = "Engenharia";
    const rt = String(returnTo || "").toLowerCase();
    if (!rt) return `${base} → Obras → Obra selecionada → Planilha orçamentária`;
    if (rt.includes("/dashboard/engenharia/obras/ativa")) return `${base} → Obras → Obra ativa → Obra selecionada → Planilha orçamentária`;
    if (rt.includes("/dashboard/engenharia/obras")) return `${base} → Obras → Obra selecionada → Planilha orçamentária`;
    return `${base} → Obra selecionada → Planilha orçamentária`;
  }, [returnTo]);

  async function authFetch(input: RequestInfo | URL, init?: RequestInit) {
    let token: string | null = null;
    try {
      if (typeof window !== "undefined") token = localStorage.getItem("token");
    } catch {}
    return fetch(input, {
      ...init,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(init?.headers || {}),
      },
      cache: "no-store",
    });
  }

  function resetLinhaForm() {
    setEditingLinhaId(null);
    setNovo({ tipoLinha: "SERVICO", item: "", codigo: "", fonte: "", servicos: "", und: "", quant: "", valorUnitario: "", valorParcial: "" });
    setLinhaErrors({});
    setLinhaFormErr(null);
    setOkMsg(null);
    editSnapshotRef.current = null;
  }

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      const hasTyped = [novo.item, novo.codigo, novo.fonte, novo.servicos, novo.und, novo.quant, novo.valorUnitario, novo.valorParcial].some((v) => String(v || "").trim());
      if (!editingLinhaId && !hasTyped) return;
      e.preventDefault();
      resetLinhaForm();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [editingLinhaId, novo]);

  async function obterPrecoUnitarioServico(codigoServicoRaw: string, planilhaIdForQuery?: number | null) {
    const codigoServico = String(codigoServicoRaw || "").trim().toUpperCase();
    const pid =
      planilhaIdForQuery != null && Number.isFinite(planilhaIdForQuery) && planilhaIdForQuery > 0
        ? planilhaIdForQuery
        : planilha?.idPlanilha != null
          ? Number(planilha.idPlanilha)
          : 0;
    if (!pid || !codigoServico) return null;
    const res = await authFetch(
      `/api/v1/engenharia/obras/${idObra}/planilha/servicos/${encodeURIComponent(codigoServico)}/preco-unitario?planilhaId=${encodeURIComponent(String(pid))}`
    );
    const json = await res.json().catch(() => null);
    if (!res.ok || !json?.success) return null;
    const v = json.data?.valorUnitario;
    const has = Boolean(json.data?.hasComposicao);
    return { valorUnitario: Number(v || 0), hasComposicao: has };
  }

  function baixarModeloCsv() {
    const sep = ";";
    const lines = [
      ["item", "codigo", "fonte", "servicos", "und", "quant", "valor_unitario", "tipo_linha"].join(sep),
      ["1", "", "", "SERVIÇOS PRELIMINARES", "", "", "", "ITEM"].join(sep),
      ["1.1", "", "", "Terraplenagem", "", "", "", "SUBITEM"].join(sep),
      ["1.1.1", "SER-0001", "SINAPI", "Escavação manual", "m³", "10", "100,00", "SERVICO"].join(sep),
    ];
    const csv = `${lines.join("\n")}\n`;
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `planilha_obra_${idObra}_modelo.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function exportarCsvPlanilha() {
    if (!planilha) return;
    const sep = ";";
    const headers = ["item", "codigo", "fonte", "servicos", "und", "quant", "valor_unitario", "valor_parcial", "tipo_linha"];
    const lines = [headers.join(sep)];
    for (const l of sortPlanilhaLinhasByItem(planilha.linhas || [])) {
      const valorParcialOut =
        l.tipoLinha === "ITEM" || l.tipoLinha === "SUBITEM"
          ? (() => {
              const k = String(l.item || "").trim();
              const info = k ? subtotalByItemKey.get(k) : null;
              if (!info?.count) return "";
              return String(Number((info.sum || 0).toFixed(2)));
            })()
          : String(l.valorParcial || "");
      lines.push(
        [
          String(l.item || ""),
          String(l.codigo || ""),
          String(l.fonte || ""),
          String(l.servicos || ""),
          String(l.und || ""),
          String(l.quant || ""),
          String(l.valorUnitario || ""),
          valorParcialOut,
          String(l.tipoLinha || ""),
        ]
          .map((v) => (String(v).includes(sep) || String(v).includes('"') || String(v).includes("\n") ? `"${String(v).replace(/"/g, '""')}"` : String(v)))
          .join(sep)
      );
    }
    const csv = `${lines.join("\n")}\n`;
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `planilha_obra_${idObra}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function carregarEmpresaDocumentosLayout() {
    try {
      const res = await authFetch(`/api/v1/empresa/documentos-layout`);
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        setEmpresaDocumentosLayout(null);
        return;
      }
      const dl = (json.data?.documentosLayout || null) as any;
      if (!dl) {
        setEmpresaDocumentosLayout(null);
        return;
      }
      setEmpresaDocumentosLayout({
        logoDataUrl: dl.logoDataUrl == null ? null : String(dl.logoDataUrl || ""),
        cabecalhoHtml: dl.cabecalhoHtml == null ? null : String(dl.cabecalhoHtml || ""),
        rodapeHtml: dl.rodapeHtml == null ? null : String(dl.rodapeHtml || ""),
        cabecalhoAlturaMm: dl.cabecalhoAlturaMm == null ? null : Number(dl.cabecalhoAlturaMm),
        rodapeAlturaMm: dl.rodapeAlturaMm == null ? null : Number(dl.rodapeAlturaMm),
        atualizadoEm: dl.atualizadoEm == null ? null : String(dl.atualizadoEm || ""),
      });
    } catch {
      setEmpresaDocumentosLayout(null);
    }
  }

  function applyEmpresaDocTokens(html: string, layout: EmpresaDocumentosLayout | null) {
    const dataHora = new Date().toLocaleString("pt-BR");
    const logoHtml = layout?.logoDataUrl ? `<img alt="Logo" src="${escapeHtml(layout.logoDataUrl)}" style="max-height:100%;max-width:100%;object-fit:contain;" />` : "";
    return String(html || "")
      .replaceAll("{{DATA_HORA}}", escapeHtml(dataHora))
      .replaceAll("{{PAGINA}}", "")
      .replaceAll("{{TOTAL_PAGINAS}}", "")
      .replaceAll("{{LOGO}}", logoHtml);
  }

  function imprimirPlanilha() {
    if (!planilha) return;
    const w = window.open("", "_blank");
    if (!w) {
      window.print();
      return;
    }
    const printDocTitle = "\u200B";
    const obraNome = obraResumo?.nome ? String(obraResumo.nome) : "";
    const contratoNumero = obraResumo?.contratoNumero ? String(obraResumo.contratoNumero) : "";
    const dataHoje = new Date().toLocaleDateString("pt-BR");
    const pp = uiPrefs.print;
    const headerFontWeight = pp.headerFontWeight === "bold" ? 700 : pp.headerFontWeight === "normal" ? 400 : 600;
    const topToHeaderPx = Math.max(0, Number(pp.topToHeaderPx || 0));
    const headerToDadosPx = Math.max(0, Number(pp.headerToDadosPx || 0));
    const dadosToTabelaPx = Math.max(0, Number(pp.dadosToTabelaPx || 0));
    const itemBg = uiPrefs.itemBg || "#F8FAFC";
    const subitemBg = uiPrefs.subitemBg || "#FFFFFF";
    const rowsHtml = sortPlanilhaLinhasByItem(planilha.linhas || [])
      .map((l) => {
        const tipo = String(l.tipoLinha || "");
        const isItem = tipo === "ITEM";
        const isSubitem = tipo === "SUBITEM";
        const isHeader = isItem || isSubitem;
        const bg = isItem ? itemBg : isSubitem ? subitemBg : "";
        const style = `${isHeader ? "font-weight:700;font-size:12px;" : ""}${bg ? `background:${bg};` : ""}`;
        return `<tr style="${style}">
          <td>${escapeHtml(l.item || "")}</td>
          <td>${escapeHtml(l.codigo || "")}</td>
          <td>${escapeHtml(l.fonte || "")}</td>
          <td>${escapeHtml(l.servicos || "")}</td>
          <td>${escapeHtml(l.und || "")}</td>
          <td style="text-align:right">${escapeHtml(l.quant || "")}</td>
          <td style="text-align:right">${escapeHtml(l.valorUnitario || "")}</td>
          <td style="text-align:right">${escapeHtml(l.valorParcial || "")}</td>
        </tr>`;
      })
      .join("");

    const p = planilha.parametros || ({} as any);
    const fmtPercent = (n: unknown) => {
      const num = typeof n === "number" ? n : n == null ? null : Number(n);
      if (num == null || !Number.isFinite(num)) return "-";
      return `${num.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
    };
    const fmtText = (s: unknown) => {
      const t = String(s ?? "").trim();
      return t ? escapeHtml(t) : "-";
    };
    const cabecalhoEmpresaHtml =
      pp.includeEmpresaHeader && (empresaDocumentosLayout?.cabecalhoHtml || empresaDocumentosLayout?.logoDataUrl)
        ? `<div class="empresa-cabecalho" style="${empresaDocumentosLayout?.cabecalhoAlturaMm ? `min-height:${Number(empresaDocumentosLayout.cabecalhoAlturaMm)}mm;` : ""}">
            ${empresaDocumentosLayout?.cabecalhoHtml ? applyEmpresaDocTokens(empresaDocumentosLayout.cabecalhoHtml, empresaDocumentosLayout) : ""}
          </div>`
        : "";

    const colgroupHtml = `
      <colgroup>
        <col style="width:44px" />
        <col style="width:96px" />
        <col style="width:68px" />
        <col />
        <col style="width:50px" />
        <col style="width:64px" />
        <col style="width:74px" />
        <col style="width:86px" />
      </colgroup>
    `;

    const cabecalhoTabelaHtml = `
      <div class="cabecalho-tabela" style="margin-top:10px;">
        <table class="planilha-head-table">
          ${colgroupHtml}
          <thead>
            <tr>
              <th>ITEM</th>
              <th>CÓDIGO</th>
              <th>FONTE</th>
              <th>SERVIÇOS</th>
              <th>UND</th>
              <th style="text-align:right">QUANT.</th>
              <th style="text-align:right">VALOR UNIT.</th>
              <th style="text-align:right">VALOR PARCIAL</th>
            </tr>
          </thead>
        </table>
      </div>
    `;

    const cabecalhoPlanilhaHtml = `
      <div class="cabecalho-planilha" style="margin-top:${headerToDadosPx}px;">
        <div class="cab-outer">
          <div class="cab-left">
            <div class="cab-linha"><span class="lab">Contrato:</span><span class="val">${fmtText(contratoNumero)}</span></div>
            <div class="cab-linha"><span class="lab">Objeto:</span><span class="val up">${fmtText(obraNome)}</span></div>
            <div class="cab-linha"><span class="lab">Município:</span><span class="val">-</span></div>
            <div class="cab-linha"><span class="lab">Endereço:</span><span class="val up">-</span></div>
            <div class="cab-linha"><span class="lab">Data:</span><span class="val">${fmtText(dataHoje)}</span></div>
          </div>

          <div class="cab-right">
            <table class="cab-param">
              <thead>
                <tr>
                  <th class="p-title">PARÂMETROS</th>
                  <th class="p-col">SBC</th>
                  <th class="p-col">SINAPI</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td class="p-k">Data-base</td>
                  <td class="p-v">${fmtText(p.dataBaseSbc)}</td>
                  <td class="p-v">${fmtText(p.dataBaseSinapi)}</td>
                </tr>
                <tr>
                  <td class="p-k">BDI de Serviços:</td>
                  <td class="p-v">${escapeHtml(fmtPercent(p.bdiServicosSbc))}</td>
                  <td class="p-v">${escapeHtml(fmtPercent(p.bdiServicosSinapi))}</td>
                </tr>
                <tr>
                  <td class="p-k">BDI Diferenciado:</td>
                  <td class="p-v">${escapeHtml(fmtPercent(p.bdiDiferenciadoSbc))}</td>
                  <td class="p-v">${escapeHtml(fmtPercent(p.bdiDiferenciadoSinapi))}</td>
                </tr>
                <tr>
                  <td class="p-k">Enc. Sociais:</td>
                  <td class="p-v">${escapeHtml(fmtPercent(p.encSociaisSemDesSbc))}</td>
                  <td class="p-v">${escapeHtml(fmtPercent(p.encSociaisSemDesSinapi))}</td>
                </tr>
                <tr>
                  <td class="p-k">Desconto:</td>
                  <td class="p-v">${escapeHtml(fmtPercent(p.descontoSbc))}</td>
                  <td class="p-v">${escapeHtml(fmtPercent(p.descontoSinapi))}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;

    const rodapeEmpresaHtml =
      empresaDocumentosLayout?.rodapeHtml || empresaDocumentosLayout?.logoDataUrl
        ? `<div class="empresa-rodape" style="${empresaDocumentosLayout?.rodapeAlturaMm ? `min-height:${Number(empresaDocumentosLayout.rodapeAlturaMm)}mm;` : ""}">
            ${empresaDocumentosLayout?.rodapeHtml ? applyEmpresaDocTokens(empresaDocumentosLayout.rodapeHtml, empresaDocumentosLayout) : ""}
          </div>`
        : "";

    w.document.open();
    w.document.write(`<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${printDocTitle}</title>
    <style>
      body { font-family: Arial, sans-serif; margin: 0; color: #0f172a; font-size: 9px; line-height: 1.12; }
      @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
      :root { --print-header-offset: 0px; }
      .print-header { position: fixed; top: ${topToHeaderPx}px; left: 0; right: 0; background: #ffffff; padding: 6px 10px; font-family: ${escapeHtml(pp.headerFontFamily)}; font-size: ${Number(pp.headerFontSizePx || 11)}px; z-index: 20; }
      .print-header, .print-header * { line-height: 1.12; }
      .print-content { padding: 6px 10px; position: relative; z-index: 1; }
      .print-spacer { height: var(--print-header-offset); }
      .empresa-cabecalho { width: 100%; }
      .empresa-rodape { width: 100%; margin-top: 14px; }
      .cabecalho-planilha { width: 100%; }
      .cabecalho-tabela { width: 100%; }
      .cab-outer { display: grid; grid-template-columns: 1fr 1fr; border: 2px solid #0f172a; }
      .cab-left { padding: 6px 8px; }
      .cab-right { border-left: 2px solid #0f172a; padding: 6px 8px; }
      .cab-linha { display: grid; grid-template-columns: 76px 1fr; gap: 8px; align-items: baseline; font-size: ${Math.max(9, Math.min(15, Number(pp.headerFontSizePx || 11)))}px; line-height: 1.1; }
      .cab-linha + .cab-linha { margin-top: 4px; }
      .lab { font-weight: ${headerFontWeight}; color: #0f172a; }
      .val { font-weight: 700; color: #0f172a; }
      .up { text-transform: uppercase; }
      .cab-param { width: 100%; border-collapse: collapse; font-size: ${Math.max(9, Math.min(15, Number(pp.headerFontSizePx || 11)))}px; line-height: 1.1; }
      .cab-param th, .cab-param td { padding: 1px 3px; vertical-align: top; border: none; }
      .cab-param thead th { font-weight: 700; color: #0f172a; text-align: left; padding-bottom: 3px; }
      .cab-param thead th.p-col { text-align: center; width: 78px; }
      .cab-param tbody td.p-k { color: #0f172a; font-weight: ${headerFontWeight}; }
      .cab-param tbody td.p-v { text-align: center; font-weight: 700; }
      .linha-sep { border-top: 2px solid #e2e8f0; margin: 10px 0 12px 0; }
      .linha-sep-footer { border-top: 2px solid #e2e8f0; margin: 14px 0 0 0; }
      table { width: 100%; border-collapse: collapse; font-size: 9px; line-height: 1.1; }
      th, td { border: 1px solid #e2e8f0; padding: 4px 6px; vertical-align: top; }
      th { background: #f8fafc; text-align: left; padding: 6px 6px; }
      .planilha-head-table th { border: 1px solid #e2e8f0; }
      .planilha-table td:nth-child(2) { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .planilha-table td:nth-child(2) { padding-top: 1px; padding-bottom: 1px; line-height: 1.0; }
    </style>
  </head>
  <body>
    <div class="print-header">
      ${cabecalhoEmpresaHtml}
      ${cabecalhoPlanilhaHtml}
      ${cabecalhoTabelaHtml}
    </div>
    <div class="print-content">
    <div class="print-spacer"></div>
    <table class="planilha-table">
      ${colgroupHtml}
      <tbody>
        ${rowsHtml}
      </tbody>
    </table>
    <div class="linha-sep-footer"></div>
    ${rodapeEmpresaHtml}
    </div>
  </body>
</html>`);
    w.document.close();
    const doPrint = () => {
      let tries = 0;
      let lastH = -1;
      let stableCount = 0;

      const measure = () => {
        tries++;
        try {
          const headerEl = w.document.querySelector(".print-header") as HTMLElement | null;
          const headerHeight = headerEl ? Math.ceil(headerEl.getBoundingClientRect().height) : 0;
          if (headerHeight === lastH) stableCount++;
          else stableCount = 0;
          lastH = headerHeight;

          const offset = Math.max(0, headerHeight + topToHeaderPx + dadosToTabelaPx);
          w.document.documentElement.style.setProperty("--print-header-offset", `${offset}px`);
        } catch {}

        if (stableCount >= 2 || tries >= 20) {
          w.focus();
          w.print();
          w.close();
          return;
        }
        w.requestAnimationFrame(measure);
      };

      w.requestAnimationFrame(measure);
    };

    window.setTimeout(doPrint, 50);
  }

  async function carregarVersoes() {
    try {
      setLoading(true);
      setErr(null);
      const res = await authFetch(`/api/v1/engenharia/obras/${idObra}/planilha?view=versoes`);
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.message || "Erro ao carregar versões");
      const data = json.data || {};
      setObraStatus(data.obraStatus ?? null);
      setObraResumo((data.obra as any) || null);
      const list = Array.isArray(data.versoes) ? (data.versoes as any[]) : [];
      const normalized: VersaoRow[] = list.map((v) => ({
        idPlanilha: Number(v.idPlanilha),
        numeroVersao: Number(v.numeroVersao),
        nome: String(v.nome || ""),
        atual: Boolean(v.atual),
        idFonteDados: v.idFonteDados == null ? null : Number(v.idFonteDados),
        idParametros: v.idParametros == null ? null : Number(v.idParametros),
        fonteNome: String(v.fonteNome || "—"),
        parametrosNome: String(v.parametrosNome || "—"),
        valorTotal: v.valorTotal == null ? 0 : Number(v.valorTotal),
        totalServicos: Number(v.totalServicos || 0),
      }));
      setVersoes(normalized);
      setPlanilhaId((cur) => cur);
    } catch (e: any) {
      setErr(e?.message || "Erro ao carregar versões");
      setVersoes([]);
      setPlanilhaId(null);
      setPlanilha(null);
    } finally {
      setLoading(false);
    }
  }

  async function carregarPlanilha(idPlanilha: number) {
    try {
      setLoading(true);
      setErr(null);
      const res = await authFetch(`/api/v1/engenharia/obras/${idObra}/planilha?planilhaId=${idPlanilha}&includeCatalog=0`);
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.message || "Erro ao carregar planilha");
      const data = json.data || {};
      setObraStatus(data.obraStatus ?? null);
      setObraResumo((data.obra as any) || null);
      setPlanilha((data.planilha as any) || null);
    } catch (e: any) {
      setErr(e?.message || "Erro ao salvar item");
    } finally {
      setLoading(false);
    }
  }

  async function carregarFontes() {
    try {
      const res = await authFetch(`/api/v1/engenharia/fontes-dados`);
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.message || "Erro ao carregar fontes");
      const list = Array.isArray(json.data?.fontes) ? (json.data.fontes as any[]) : [];
      const normalized: FonteDadosDTO[] = list.map((r) => ({
        idFonteDados: Number(r.idFonteDados),
        nome: String(r.nome || "").trim(),
        tipo: String(r.tipo || "").trim(),
        uf: String(r.uf || "").trim(),
        dataBase: String(r.dataBase || "").trim(),
        tipoPreco: String(r.tipoPreco || "").trim(),
      }));
      setFontes(normalized);
    } catch {
      setFontes([]);
    }
  }

  async function carregarParametrosCad() {
    try {
      const res = await authFetch(`/api/v1/engenharia/planilhas/parametros`);
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.message || "Erro ao carregar parâmetros");
      const list = Array.isArray(json.data?.parametros) ? (json.data.parametros as any[]) : [];
      const normalized: ParametroDTO[] = list.map((r) => ({
        idParametros: Number(r.idParametros),
        nome: String(r.nome || "").trim(),
        ufSinapi: String(r.ufSinapi || "").trim(),
        dataBaseSbc: String(r.dataBaseSbc || "").trim(),
        dataBaseSinapi: String(r.dataBaseSinapi || "").trim(),
        bdiServicosSbc: r.bdiServicosSbc == null ? null : Number(r.bdiServicosSbc),
        bdiServicosSinapi: r.bdiServicosSinapi == null ? null : Number(r.bdiServicosSinapi),
        bdiDiferenciadoSbc: r.bdiDiferenciadoSbc == null ? null : Number(r.bdiDiferenciadoSbc),
        bdiDiferenciadoSinapi: r.bdiDiferenciadoSinapi == null ? null : Number(r.bdiDiferenciadoSinapi),
        encSociaisSemDesSbc: r.encSociaisSemDesSbc == null ? null : Number(r.encSociaisSemDesSbc),
        encSociaisSemDesSinapi: r.encSociaisSemDesSinapi == null ? null : Number(r.encSociaisSemDesSinapi),
        descontoSbc: r.descontoSbc == null ? null : Number(r.descontoSbc),
        descontoSinapi: r.descontoSinapi == null ? null : Number(r.descontoSinapi),
      }));
      setParametrosCad(normalized);
    } catch {
      setParametrosCad([]);
    }
  }

  async function carregarComposicaoStatus(pid?: number | null) {
    try {
      const planilhaIdQuery = pid != null ? Number(pid) : planilhaId != null ? Number(planilhaId) : 0;
      const qs = planilhaIdQuery ? `?planilhaId=${planilhaIdQuery}` : "";
      const res = await authFetch(`/api/v1/engenharia/obras/${idObra}/planilha/composicoes/status${qs}`);
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        setComposicaoServicoCodes(new Set());
        return;
      }
      const codes = Array.isArray(json.data?.codes) ? json.data.codes : [];
      setComposicaoServicoCodes(new Set(codes.map((c: any) => String(c || "").trim().toUpperCase()).filter(Boolean)));
    } catch {
      setComposicaoServicoCodes(new Set());
    }
  }

  async function carregarComposicaoValidacao(pid?: number | null) {
    try {
      const planilhaIdQuery = pid != null ? Number(pid) : planilhaId != null ? Number(planilhaId) : 0;
      if (!planilhaIdQuery) {
        setComposicaoValidacaoByCodigo({});
        return;
      }
      const res = await authFetch(`/api/v1/engenharia/obras/${idObra}/planilha/composicoes/validacao?planilhaId=${planilhaIdQuery}`);
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        setComposicaoValidacaoByCodigo({});
        return;
      }
      const rows = Array.isArray(json.data?.rows) ? (json.data.rows as any[]) : [];
      const map: Record<string, ComposicaoValidacaoRow> = {};
      for (const r of rows) {
        const code = String(r.codigoServico || "").trim().toUpperCase();
        if (!code) continue;
        map[code] = {
          codigoServico: code,
          servico: String(r.servico || ""),
          totalPlanilha: Number(r.totalPlanilha || 0),
          totalComposicao: Number(r.totalComposicao || 0),
          diff: Number(r.diff || 0),
          status: String(r.status || "OK") as any,
          qtdItens: Number(r.qtdItens || 0),
        };
      }
      setComposicaoValidacaoByCodigo(map);
    } catch {
      setComposicaoValidacaoByCodigo({});
    }
  }

  useEffect(() => {
    if (!idObra) return;
    let cancelled = false;
    bootPendingRef.current = 2;
    setBootLoading(true);
    setBootDone(false);
    void (async () => {
      try {
        await Promise.all([carregarVersoes(), carregarEmpresaDocumentosLayout(), carregarFontes(), carregarParametrosCad()]);
      } finally {
        if (!cancelled) {
          bootPendingRef.current = Math.max(0, bootPendingRef.current - 1);
          if (bootPendingRef.current <= 0) {
            setBootLoading(false);
            setBootDone(true);
          }
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [idObra]);

  useEffect(() => {
    if (!idObra) return;
    let cancelled = false;
    void (async () => {
      try {
        await Promise.all([planilhaId ? carregarPlanilha(planilhaId) : Promise.resolve(), carregarComposicaoStatus(planilhaId), carregarComposicaoValidacao(planilhaId)]);
      } finally {
        if (!cancelled) {
          bootPendingRef.current = Math.max(0, bootPendingRef.current - 1);
          if (bootPendingRef.current <= 0) {
            setBootLoading(false);
            setBootDone(true);
          }
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [idObra, planilhaId]);

  if (!idObra) return <div className="p-6 rounded-xl border bg-white">Obra inválida.</div>;

  function abrirModalNovaPlanilha(mode: "NOVA" | "CLONAR" = "NOVA") {
    const nextVersao = Math.max(0, ...versoes.map((v) => v.numeroVersao)) + 1;
    setModalNovaPlanilhaMode(mode);
    setNovaPlanilhaNome(`Versão ${nextVersao}`);
    setNovaPlanilhaClonarDeId("");
    setNovaPlanilhaFonteId(planilha?.idFonteDados ? String(planilha.idFonteDados) : "");
    setNovaPlanilhaParametrosId(planilha?.idParametros ? String(planilha.idParametros) : "");
    setModalNovaPlanilhaOpen(true);
  }

  useEffect(() => {
    if (!modalNovaPlanilhaOpen) return;
    if (modalNovaPlanilhaMode !== "CLONAR") return;
    const sourceId = Number(String(novaPlanilhaClonarDeId || "").trim() || 0);
    if (!sourceId) return;
    const v = versoes.find((x) => Number(x.idPlanilha) === Number(sourceId)) || null;
    if (!v) return;
    setNovaPlanilhaFonteId(v.idFonteDados != null ? String(v.idFonteDados) : "");
    setNovaPlanilhaParametrosId(v.idParametros != null ? String(v.idParametros) : "");
  }, [modalNovaPlanilhaOpen, modalNovaPlanilhaMode, novaPlanilhaClonarDeId, versoes]);

  async function confirmarNovaPlanilha() {
    const nome = String(novaPlanilhaNome || "").trim();
    const idFonteDados = Number(String(novaPlanilhaFonteId || "").trim() || 0);
    const idParametros = Number(String(novaPlanilhaParametrosId || "").trim() || 0);
    const copyFromPlanilhaId = modalNovaPlanilhaMode === "CLONAR" ? Number(String(novaPlanilhaClonarDeId || "").trim() || 0) : 0;
    if (!nome) {
      setErr("Informe o nome da planilha.");
      return;
    }
    if (!idFonteDados) {
      setErr("Selecione a Fonte de dados.");
      return;
    }
    if (!idParametros) {
      setErr("Selecione o Parâmetro.");
      return;
    }
    if (modalNovaPlanilhaMode === "CLONAR" && !copyFromPlanilhaId) {
      setErr("Selecione a planilha origem para clonar.");
      return;
    }
    const avisoCompartilhado =
      "Atenção: Fonte de dados e Parâmetros são compartilhados.\n\n" +
      "- Se você alterar um Serviço/Insumo/Composição da Fonte, muda em TODAS as planilhas que usam essa Fonte.\n" +
      "- Se você alterar um Parâmetro, muda em TODAS as planilhas que usam esse Parâmetro.\n\n" +
      "Deseja continuar?";
    if (!window.confirm(avisoCompartilhado)) return;
    try {
      setLoading(true);
      setErr(null);
      setOkMsg(null);
      const res = await authFetch(`/api/v1/engenharia/obras/${idObra}/planilha`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "NOVA_VERSAO",
          nome,
          idFonteDados,
          idParametros,
          copyFromPlanilhaId: copyFromPlanilhaId ? copyFromPlanilhaId : undefined,
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.message || "Erro ao criar nova versão");
      const idPlanilhaNew = Number(json.data?.idPlanilha || 0);
      setModalNovaPlanilhaOpen(false);
      await carregarVersoes();
      if (idPlanilhaNew) setPlanilhaId(idPlanilhaNew);
      setOkMsg("Planilha criada com sucesso.");
    } catch (e: any) {
      setErr(e?.message || "Erro ao criar nova versão");
    } finally {
      setLoading(false);
    }
  }

  function criarNovaVersao() {
    abrirModalNovaPlanilha("NOVA");
  }

  function calcValorParcialLinha(quant: string, valorUnitario: string) {
    const q = parseNumberLoose(quant);
    const v = parseNumberLoose(valorUnitario);
    if (q == null || v == null) return null;
    if (!(q > 0) || !(v >= 0)) return null;
    const parcial = Number((q * v).toFixed(2));
    if (!Number.isFinite(parcial)) return null;
    return parcial.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function applyValorParcialAuto(next: typeof novo) {
    if (next.tipoLinha !== "SERVICO") return { ...next, valorParcial: "" };
    const calc = calcValorParcialLinha(next.quant, next.valorUnitario);
    return { ...next, valorParcial: calc ?? "" };
  }

  function validateLinha(next: typeof novo) {
    const errors: Partial<Record<keyof typeof novo, string>> = {};
    if (!String(next.item || "").trim()) errors.item = "Obrigatório";
    if (!String(next.servicos || "").trim()) errors.servicos = "Obrigatório";
    const itemNorm = String(next.item || "").trim();
    if (planilha && itemNorm) {
      const dup = (planilha.linhas || []).some((l) => {
        if (editingLinhaId && Number(l.idLinha) === Number(editingLinhaId)) return false;
        return String(l.item || "").trim() === itemNorm;
      });
      if (dup) errors.item = "Já existe";
    }
    if (next.tipoLinha === "SERVICO") {
      if (!String(next.codigo || "").trim()) errors.codigo = "Obrigatório";
      if (!String(next.und || "").trim()) errors.und = "Obrigatório";
      const q = parseNumberLoose(next.quant);
      if (q == null || !(q > 0)) errors.quant = "Inválido";
      const v = parseNumberLoose(next.valorUnitario) ?? 0;
      if (!(v >= 0)) errors.valorUnitario = "Inválido";
      const vp = calcValorParcialLinha(next.quant, String(v));
      if (!vp) errors.valorParcial = "Inválido";
    }
    return errors;
  }

  async function salvarLinha() {
    if (!planilha) return;
    try {
      setOkMsg(null);
      setLoading(true);
      setErr(null);
      setLinhaErrors({});
      setLinhaFormErr(null);
      let normalized = applyValorParcialAuto({ ...novo });
      if (normalized.tipoLinha !== "SERVICO") {
        normalized = { ...normalized, codigo: "", fonte: "", und: "", quant: "", valorUnitario: "" };
      }
      if (normalized.tipoLinha === "SERVICO") {
        const info = await obterPrecoUnitarioServico(normalized.codigo, planilha.idPlanilha);
        const vu = info?.valorUnitario != null ? info.valorUnitario : 0;
        normalized = applyValorParcialAuto({ ...normalized, valorUnitario: String(vu) });
      }
      const nextErrors = validateLinha(normalized);
      setLinhaErrors(nextErrors);
      if (Object.keys(nextErrors).length) {
        setLinhaFormErr(buildLinhaFormErrorMessage(nextErrors as any));
        setLoading(false);
        return;
      }
      const existing = editingLinhaId ? (planilha.linhas || []).find((l) => Number(l.idLinha) === Number(editingLinhaId)) : null;
      const ordem = existing?.ordem != null ? Number(existing.ordem || 0) : (planilha.linhas || []).reduce((m, l) => Math.max(m, Number(l.ordem || 0)), 0) + 1;
      const res = await authFetch(`/api/v1/engenharia/obras/${idObra}/planilha`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "UPSERT_LINHA",
          idPlanilha: planilha.idPlanilha,
          linha: {
            idLinha: editingLinhaId,
            ordem,
            item: normalized.item,
            codigo: normalized.codigo,
            fonte: normalized.fonte,
            servicos: normalized.servicos,
            und: normalized.und,
            quant: normalized.quant,
            valorUnitario: normalized.valorUnitario,
            valorParcial: normalized.valorParcial,
            tipoLinha: normalized.tipoLinha,
          },
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.message || "Erro ao salvar linha");
      resetLinhaForm();
      await carregarPlanilha(planilha.idPlanilha);
      await carregarVersoes();
      setOkMsg(editingLinhaId ? "Serviço atualizado com sucesso." : "Linha salva com sucesso.");
    } catch (e: any) {
      setErr(e?.message || "Erro ao salvar linha");
    } finally {
      setLoading(false);
    }
  }

  async function excluirLinha(idLinha: number) {
    if (!planilha) return;
    if (!window.confirm("Excluir esta linha?")) return;
    try {
      setLoading(true);
      setErr(null);
      const res = await authFetch(`/api/v1/engenharia/obras/${idObra}/planilha`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "EXCLUIR_LINHA", idPlanilha: planilha.idPlanilha, idLinha }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.message || "Erro ao excluir linha");
      setEditingLinhaId((cur) => (cur === idLinha ? null : cur));
      await carregarPlanilha(planilha.idPlanilha);
      await carregarVersoes();
    } catch (e: any) {
      setErr(e?.message || "Erro ao excluir linha");
    } finally {
      setLoading(false);
    }
  }

  function iniciarEdicaoLinha(l: any) {
    if (!l) return;
    const next = {
      tipoLinha: (l.tipoLinha as any) || "SERVICO",
      item: String(l.item || ""),
      codigo: String(l.codigo || ""),
      fonte: String(l.fonte || ""),
      servicos: String(l.servicos || ""),
      und: String(l.und || ""),
      quant: String(l.quant || ""),
      valorUnitario: String(l.valorUnitario || ""),
      valorParcial: String(l.valorParcial || ""),
    };
    setEditingLinhaId(Number(l.idLinha));
    setNovo(next);
    editSnapshotRef.current = { editingLinhaId: Number(l.idLinha), novo: next };
    setLinhaErrors({});
    setLinhaFormErr(null);
    setOkMsg(null);
    setShowPlanilhaCard(true);
    setShowAdicionarCard(true);
    scrollToRef(adicionarLinhaRef);
  }

  async function clonarPlanilha(v: VersaoRow) {
    const sourcePlanilhaId = v?.idPlanilha ? Number(v.idPlanilha) : 0;
    if (!sourcePlanilhaId) return;
    setClonarTarget(v);
    setClonarIncludeParametros(false);
    setClonarIncludeFonte(false);
    setModalClonarPlanilhaOpen(true);
  }

  async function confirmarClonarPlanilha() {
    const v = clonarTarget;
    const sourcePlanilhaId = v?.idPlanilha ? Number(v.idPlanilha) : 0;
    if (!sourcePlanilhaId) return;
    try {
      setLoading(true);
      setErr(null);
      setOkMsg(null);
      const nome = `Versão ${Math.max(0, ...versoes.map((vv) => vv.numeroVersao)) + 1} (Clonada)`;
      const res = await authFetch(`/api/v1/engenharia/obras/${idObra}/planilha`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "DUPLICAR_VERSAO", sourcePlanilhaId, nome }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.message || "Erro ao clonar planilha");
      const idPlanilhaNew = Number(json.data?.idPlanilha || 0);
      const numeroVersaoNew = Number(json.data?.numeroVersao || 0);
      if (!idPlanilhaNew) throw new Error("Planilha clonada inválida");
      if (!numeroVersaoNew) throw new Error("Número da versão da planilha clonada inválido");

      let idFonteDadosFinal = v?.idFonteDados != null ? Number(v.idFonteDados) : 0;
      let idParametrosFinal = v?.idParametros != null ? Number(v.idParametros) : 0;
      if (!idFonteDadosFinal) throw new Error("Fonte de dados da planilha origem não definida");
      if (!idParametrosFinal) throw new Error("Parâmetros da planilha origem não definidos");

      if (clonarIncludeFonte) {
        const resFonte = await authFetch(`/api/v1/engenharia/fontes-dados/clonar`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ idFonteDados: idFonteDadosFinal }),
        });
        const jsonFonte = await resFonte.json().catch(() => null);
        if (!resFonte.ok || !jsonFonte?.success) throw new Error(jsonFonte?.message || "Erro ao clonar fonte de dados");
        const idFonteNew = Number(jsonFonte.data?.idFonteDados || 0);
        if (!idFonteNew) throw new Error("Fonte clonada inválida");
        idFonteDadosFinal = idFonteNew;
        await carregarFontes();
      }

      if (clonarIncludeParametros) {
        const resParam = await authFetch(`/api/v1/engenharia/planilhas/parametros/clonar`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ idParametros: idParametrosFinal }),
        });
        const jsonParam = await resParam.json().catch(() => null);
        if (!resParam.ok || !jsonParam?.success) throw new Error(jsonParam?.message || "Erro ao clonar parâmetros");
        const idParamNew = Number(jsonParam.data?.idParametros || 0);
        if (!idParamNew) throw new Error("Parâmetro clonado inválido");
        idParametrosFinal = idParamNew;
        await carregarParametrosCad();
      }

      if (clonarIncludeFonte || clonarIncludeParametros) {
        const resEdit = await authFetch(`/api/v1/engenharia/obras/${idObra}/planilha`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "EDITAR_VERSAO",
            idPlanilha: idPlanilhaNew,
            numeroVersao: numeroVersaoNew,
            nome,
            idFonteDados: idFonteDadosFinal,
            idParametros: idParametrosFinal,
          }),
        });
        const jsonEdit = await resEdit.json().catch(() => null);
        if (!resEdit.ok || !jsonEdit?.success) throw new Error(jsonEdit?.message || "Erro ao vincular fonte/parâmetros clonados");
      }

      setModalClonarPlanilhaOpen(false);
      await carregarVersoes();
      if (idPlanilhaNew) setPlanilhaId(idPlanilhaNew);
      setOkMsg("Planilha clonada com sucesso.");
    } catch (e: any) {
      setErr(e?.message || "Erro ao clonar planilha");
    } finally {
      setLoading(false);
    }
  }

  async function definirPlanilhaComoAtual(idPlanilha: number) {
    if (!idPlanilha) return;
    if (!window.confirm("Definir esta planilha como a atual?")) return;
    try {
      setLoading(true);
      setErr(null);
      setOkMsg(null);
      const res = await authFetch(`/api/v1/engenharia/obras/${idObra}/planilha`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "DEFINIR_ATUAL", idPlanilha }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.message || "Erro ao definir planilha como atual");
      await carregarVersoes();
      setPlanilhaId(idPlanilha);
      setOkMsg("Planilha definida como atual.");
    } catch (e: any) {
      setErr(e?.message || "Erro ao definir planilha como atual");
    } finally {
      setLoading(false);
    }
  }

  async function editarVersao(v: VersaoRow) {
    if (!v?.idPlanilha) return;
    setEditarPlanilhaTarget(v);
    setEditarPlanilhaNome(String(v.nome || ""));
    setEditarPlanilhaNumeroVersao(String(v.numeroVersao || ""));
    setEditarPlanilhaFonteId(v.idFonteDados != null ? String(v.idFonteDados) : "");
    setEditarPlanilhaParametrosId(v.idParametros != null ? String(v.idParametros) : "");
    setModalEditarPlanilhaOpen(true);
  }

  async function confirmarEditarPlanilha() {
    const target = editarPlanilhaTarget;
    if (!target?.idPlanilha) return;
    const nome = String(editarPlanilhaNome || "").trim();
    const numeroVersao = Number(String(editarPlanilhaNumeroVersao || "").trim() || 0);
    const idFonteDados = Number(String(editarPlanilhaFonteId || "").trim() || 0);
    const idParametros = Number(String(editarPlanilhaParametrosId || "").trim() || 0);
    if (!nome) {
      setErr("Informe o nome da planilha.");
      return;
    }
    if (!Number.isFinite(numeroVersao) || numeroVersao <= 0 || Math.floor(numeroVersao) !== numeroVersao) {
      setErr("Número de versão inválido.");
      return;
    }
    if (!idFonteDados) {
      setErr("Selecione a Fonte de dados.");
      return;
    }
    if (!idParametros) {
      setErr("Selecione o Parâmetro.");
      return;
    }
    const avisoCompartilhado =
      "Atenção: Fonte de dados e Parâmetros são compartilhados.\n\n" +
      "- Alterar Serviço/Insumo/Composição da Fonte afeta TODAS as planilhas que usam essa Fonte.\n" +
      "- Alterar Parâmetros afeta TODAS as planilhas que usam esse Parâmetro.\n\n" +
      "Deseja continuar?";
    if (!window.confirm(avisoCompartilhado)) return;
    try {
      setLoading(true);
      setErr(null);
      setOkMsg(null);
      const res = await authFetch(`/api/v1/engenharia/obras/${idObra}/planilha`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "EDITAR_VERSAO",
          idPlanilha: target.idPlanilha,
          numeroVersao,
          nome,
          idFonteDados,
          idParametros,
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.message || "Erro ao editar versão");
      setModalEditarPlanilhaOpen(false);
      await carregarVersoes();
      if (planilhaId === target.idPlanilha) await carregarPlanilha(target.idPlanilha);
      setOkMsg("Versão atualizada.");
    } catch (e: any) {
      setErr(e?.message || "Erro ao editar versão");
    } finally {
      setLoading(false);
    }
  }

  async function excluirPlanilha(v: VersaoRow) {
    if (!v?.idPlanilha) return;
    const msg =
      "Excluir a planilha inteira?\n\nIsso remove:\n- Linhas/serviços\n- Composições/subcomposições\n- Preços de insumos\n\nAlém disso, se a Fonte de dados e/ou os Parâmetros desta planilha NÃO estiverem compartilhados com outras planilhas, eles também serão excluídos.\n\nEsta ação não pode ser desfeita.";
    if (!window.confirm(msg)) return;
    try {
      setLoading(true);
      setErr(null);
      setOkMsg(null);
      const res = await authFetch(`/api/v1/engenharia/obras/${idObra}/planilha`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "EXCLUIR_PLANILHA", idPlanilha: v.idPlanilha }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.message || "Erro ao excluir planilha");
      const nextAtual = json.data?.idPlanilhaAtual == null ? null : Number(json.data.idPlanilhaAtual);
      await carregarVersoes();
      if (nextAtual) setPlanilhaId(nextAtual);
      else {
        setPlanilhaId(null);
        setPlanilha(null);
      }
      setOkMsg("Planilha excluída.");
    } catch (e: any) {
      setErr(e?.message || "Erro ao excluir planilha");
    } finally {
      setLoading(false);
    }
  }

  async function importarCsv(file: File, nomeVersao?: string) {
    try {
      setLoading(true);
      setErr(null);
      const form = new FormData();
      form.append("action", "IMPORTAR_CSV");
      form.append("nome", String(nomeVersao || `Versão ${Math.max(0, ...versoes.map((v) => v.numeroVersao)) + 1} (CSV)`));
      form.append("idFonteDados", String(importFonteId || ""));
      form.append("idParametros", String(importParametrosId || ""));
      form.append("file", file);
      const res = await authFetch(`/api/v1/engenharia/obras/${idObra}/planilha`, { method: "POST", body: form });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.message || "Erro ao importar CSV");
      const idPlanilhaNew = Number(json.data?.idPlanilha || 0);
      await carregarVersoes();
      if (idPlanilhaNew) setPlanilhaId(idPlanilhaNew);
    } catch (e: any) {
      setErr(e?.message || "Erro ao importar CSV");
    } finally {
      setLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function prepararImportacaoCsv(file: File) {
    try {
      setErr(null);
      const text = await readTextSmart(file);
      const { headers, rows } = parseCsvTextAuto(text);
      if (!headers.length || !rows.length) {
        setImportPreview({ file: null, nomeVersao: "", rows: [], missingColumns: [] });
        setErr("CSV vazio ou inválido.");
        return;
      }
      const idx: Record<string, number> = Object.fromEntries(headers.map((h, i) => [normalizeHeader(h), i]));
      const required = ["item", "codigo", "fonte", "servicos", "und", "quant", "valor_unitario"];
      const missingColumns = required.filter((k) => idx[k] == null);
      const get = (r: string[], key: string) => String(r[idx[key]] ?? "").trim();
      const nomeVersao = `Versão ${Math.max(0, ...versoes.map((v) => v.numeroVersao)) + 1} (CSV)`;

      const mapped = rows.map((r, i) => {
        const item = get(r, "item");
        const codigo = get(r, "codigo");
        const fonte = get(r, "fonte");
        const servicos = get(r, "servicos");
        const und = get(r, "und");
        const quant = get(r, "quant");
        const valorUnitario = get(r, "valor_unitario");
        const tipoLinhaRaw = idx["tipo_linha"] != null ? get(r, "tipo_linha") : "";
        const tipoLinhaNorm = String(tipoLinhaRaw || "").trim().toUpperCase();
        const tipoLinhaFromCsv = tipoLinhaNorm === "ITEM" || tipoLinhaNorm === "SUBITEM" || tipoLinhaNorm === "SERVICO" ? tipoLinhaNorm : "";
        const det = tipoLinhaFromCsv ? { tipo: tipoLinhaFromCsv as any, nivel: item.trim() ? Math.max(0, item.split(".").filter(Boolean).length) : 0 } : detectTipoLinha(item, codigo, und, quant, valorUnitario);
        const quantidade = toDec(quant);
        const vUnit = toDec(valorUnitario);
        const valorParcialCalc = quantidade != null && vUnit != null ? Number((quantidade * vUnit).toFixed(6)) : null;

        const errors: any = {};
        if (!item.trim()) errors.item = "Obrigatório";
        if (!servicos.trim()) errors.servicos = "Obrigatório";
        if (tipoLinhaNorm && !tipoLinhaFromCsv) errors.tipoLinha = "tipo_linha inválido (use ITEM, SUBITEM ou SERVICO)";

        if (det.tipo === "SERVICO") {
          if (!codigo.trim()) errors.codigo = "Obrigatório (serviço)";
          if (!und.trim()) errors.und = "Obrigatório (serviço)";
          if (quantidade == null || !(quantidade > 0)) errors.quant = "Inválido (serviço)";
          if (vUnit == null || !(vUnit >= 0)) errors.valorUnitario = "Inválido (serviço)";
        } else {
          if (codigo.trim()) errors.codigo = "Não usar código em ITEM/SUBITEM";
          if (und.trim()) errors.und = "Não usar und em ITEM/SUBITEM";
          if (quant.trim()) errors.quant = "Não usar quant em ITEM/SUBITEM";
          if (valorUnitario.trim()) errors.valorUnitario = "Não usar valor_unitario em ITEM/SUBITEM";
        }

        return {
          rowIndex: i,
          item,
          codigo,
          fonte,
          servicos,
          und,
          quant,
          valorUnitario,
          valorParcialCalc,
          tipoLinha: det.tipo,
          nivel: det.nivel,
          errors,
        };
      });

      setImportPreview({ file, nomeVersao, rows: mapped, missingColumns });
      const fonteFromPlanilha = (planilha as any)?.idFonteDados != null ? String((planilha as any).idFonteDados) : "";
      const paramFromPlanilha = (planilha as any)?.idParametros != null ? String((planilha as any).idParametros) : "";
      setImportFonteId(fonteFromPlanilha || (fontes[0]?.idFonteDados != null ? String(fontes[0].idFonteDados) : ""));
      setImportParametrosId(paramFromPlanilha || (parametrosCad[0]?.idParametros != null ? String(parametrosCad[0].idParametros) : ""));
    } catch (e: any) {
      setImportPreview({ file: null, nomeVersao: "", rows: [], missingColumns: [] });
      setErr(e?.message || "Erro ao ler CSV.");
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  const importHasBlockingErrors = useMemo(() => {
    if (!importPreview.file) return false;
    if (importPreview.missingColumns.length) return true;
    return importPreview.rows.some((r) => Object.keys(r.errors || {}).length > 0);
  }, [importPreview]);

  const valorTotalPlanilha = useMemo(() => {
    const rows = planilha?.linhas || [];
    let total = 0;
    for (const l of rows) {
      if (String(l.tipoLinha || "").toUpperCase() !== "SERVICO") continue;
      const n = parseNumberLoose(l.valorParcial);
      if (n != null) total += n;
    }
    return Number(total.toFixed(2));
  }, [planilha]);

  const diffPrevistoPlanilha = useMemo(() => {
    if (!obraResumo || obraResumo.valorPrevisto == null) return null;
    if (!planilha) return null;
    const diff = Number((obraResumo.valorPrevisto || 0) - (valorTotalPlanilha || 0));
    return Number.isFinite(diff) ? diff : null;
  }, [obraResumo, planilha, valorTotalPlanilha]);

  const servicosCatalogo = useMemo(() => {
    const fromCatalog = (planilha as any)?.servicosPlanilha;
    if (Array.isArray(fromCatalog) && fromCatalog.length) {
      return fromCatalog
        .map((r: any) => ({
          codigo: String(r.codigo || "").trim().toUpperCase(),
          servicos: String(r.servicos || "").trim(),
          fonte: String(r.fonte || "").trim().toUpperCase(),
          und: String(r.und || "").trim(),
        }))
        .filter((r: any) => r.codigo || r.servicos || r.fonte || r.und);
    }
    const rows = planilha?.linhas || [];
    return rows
      .filter((l) => String(l.tipoLinha || "").toUpperCase() === "SERVICO")
      .map((l) => ({
        codigo: String(l.codigo || "").trim().toUpperCase(),
        servicos: String(l.servicos || "").trim(),
        fonte: String(l.fonte || "").trim().toUpperCase(),
        und: String(l.und || "").trim(),
      }))
      .filter((r) => r.codigo || r.servicos || r.fonte || r.und);
  }, [planilha]);

  const servicosCatalogoFiltrado = useMemo(() => {
    if (novo.tipoLinha !== "SERVICO") return servicosCatalogo;
    const codigo = String(novo.codigo || "").trim().toUpperCase();
    const servicos = String(novo.servicos || "").trim().toLowerCase();
    const fonte = String(novo.fonte || "").trim().toUpperCase();
    return servicosCatalogo.filter((r) => {
      if (codigo && !r.codigo.startsWith(codigo)) return false;
      if (fonte && !r.fonte.startsWith(fonte)) return false;
      if (servicos && !String(r.servicos || "").toLowerCase().includes(servicos)) return false;
      return true;
    });
  }, [novo.codigo, novo.fonte, novo.servicos, novo.tipoLinha, servicosCatalogo]);

  const servicosCodigoOptions = useMemo(() => {
    const set = new Set<string>();
    for (const r of servicosCatalogoFiltrado) {
      if (r.codigo) set.add(r.codigo);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [servicosCatalogoFiltrado]);

  const servicosDescricaoOptions = useMemo(() => {
    const set = new Set<string>();
    for (const r of servicosCatalogoFiltrado) {
      if (r.servicos) set.add(r.servicos);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [servicosCatalogoFiltrado]);

  const servicosFonteOptions = useMemo(() => {
    const set = new Set<string>();
    for (const r of servicosCatalogoFiltrado) {
      if (r.fonte) set.add(r.fonte);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [servicosCatalogoFiltrado]);

  function findServicoMatch(next: { codigo?: string; servicos?: string; fonte?: string }) {
    const codigo = String(next.codigo || "").trim().toUpperCase();
    const servicos = String(next.servicos || "").trim();
    const fonte = String(next.fonte || "").trim().toUpperCase();

    if (codigo) return servicosCatalogo.find((r) => r.codigo === codigo) || null;
    if (servicos) return servicosCatalogo.find((r) => r.servicos === servicos) || null;
    if (fonte) {
      const matches = servicosCatalogo.filter((r) => r.fonte === fonte);
      if (matches.length === 1) return matches[0];
    }
    return null;
  }

  const servicoCatalogoByCodigo = useMemo(() => {
    if (novo.tipoLinha !== "SERVICO") return null;
    const codigo = String(novo.codigo || "").trim().toUpperCase();
    if (!codigo) return null;
    return servicosCatalogo.find((r) => r.codigo === codigo) || null;
  }, [novo.codigo, novo.tipoLinha, servicosCatalogo]);

  const servicoCamposTravadosPorCatalogo = Boolean(servicoCatalogoByCodigo);

  useEffect(() => {
    if (!servicoCatalogoByCodigo) return;
    setNovo((p) => {
      if (p.tipoLinha !== "SERVICO") return p;
      const codigo = String(p.codigo || "").trim().toUpperCase();
      if (!codigo || codigo !== servicoCatalogoByCodigo.codigo) return p;
      const next: any = { ...p };
      next.fonte = servicoCatalogoByCodigo.fonte;
      next.servicos = servicoCatalogoByCodigo.servicos;
      next.und = servicoCatalogoByCodigo.und;
      return next;
    });
  }, [servicoCatalogoByCodigo]);

  const subtotalByItemKey = useMemo(() => {
    const map = new Map<string, { sum: number; count: number }>();
    const rows = planilha?.linhas || [];
    for (const l of rows) {
      if (String(l.tipoLinha || "").toUpperCase() !== "SERVICO") continue;
      const itemStr = String(l.item || "").trim();
      if (!itemStr) continue;
      const v = parseNumberLoose(l.valorParcial);
      const parts = itemStr.split(".").map((p) => p.trim()).filter(Boolean);
      if (parts.length <= 1) continue;
      for (let i = 1; i <= parts.length - 1; i++) {
        const prefix = parts.slice(0, i).join(".");
        const cur = map.get(prefix) || { sum: 0, count: 0 };
        const nextSum = cur.sum + (typeof v === "number" && Number.isFinite(v) ? v : 0);
        map.set(prefix, { sum: Number(nextSum.toFixed(6)), count: cur.count + 1 });
      }
    }
    return map;
  }, [planilha]);

  const valorTotalPreview = useMemo(() => {
    if (!importPreview.file) return 0;
    let total = 0;
    for (const r of importPreview.rows || []) {
      if (r.tipoLinha !== "SERVICO") continue;
      if (typeof r.valorParcialCalc === "number" && Number.isFinite(r.valorParcialCalc)) total += r.valorParcialCalc;
    }
    return Number(total.toFixed(2));
  }, [importPreview]);

  const linhasOrdenadasPorItem = useMemo(() => {
    return sortPlanilhaLinhasByItem(planilha?.linhas || []);
  }, [planilha?.linhas]);

  const expandablePrefixes = useMemo(() => {
    const set = new Set<string>();
    const rows = linhasOrdenadasPorItem;
    for (const l of rows) {
      if (l.tipoLinha !== "SERVICO") continue;
      const itemStr = String(l.item || "").trim();
      if (!itemStr) continue;
      const parts = itemStr.split(".").map((p) => p.trim()).filter(Boolean);
      if (!parts.length) continue;
      const ancestorsCount = Math.max(1, parts.length - 1);
      for (let i = 1; i <= ancestorsCount; i++) {
        set.add(parts.slice(0, i).join("."));
      }
    }
    return set;
  }, [linhasOrdenadasPorItem]);

  const linhasVisiveis = useMemo(() => {
    const rows = linhasOrdenadasPorItem;
    return rows.filter((l) => {
      const tipo = String(l.tipoLinha || "").toUpperCase();
      const itemStr = String(l.item || "").trim();
      const parts = itemStr ? itemStr.split(".").map((p) => p.trim()).filter(Boolean) : [];
      const parentItem = parts.length ? parts[0] : "";

      if (tipo === "ITEM") return true;

      if (tipo === "SUBITEM") {
        if (parentItem && collapsedPrefixes.has(parentItem)) return false;
        return true;
      }

      if (tipo === "SERVICO") {
        if (somenteItens) return false;
        if (!parts.length) return true;
        const ancestorsCount = Math.max(1, parts.length - 1);
        for (let i = 1; i <= ancestorsCount; i++) {
          const prefix = parts.slice(0, i).join(".");
          if (collapsedPrefixes.has(prefix)) return false;
        }
        return true;
      }

      return true;
    });
  }, [linhasOrdenadasPorItem, somenteItens, collapsedPrefixes]);

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl text-slate-900">
      {modalNovaPlanilhaOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-2xl rounded-xl border bg-white shadow-lg">
            <div className="flex items-center justify-between gap-3 border-b p-4">
              <div className="text-lg font-semibold">Nova planilha</div>
              <button
                className="rounded-lg border bg-white px-2 py-2 text-sm hover:bg-slate-50 disabled:opacity-60"
                type="button"
                onClick={() => setModalNovaPlanilhaOpen(false)}
                disabled={loading}
                title="Fechar"
              >
                <XCircle className="h-5 w-5" />
              </button>
            </div>
            <div className="p-4 space-y-4">
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                Atenção: Fonte de dados e Parâmetros são compartilhados. Se você alterar Serviço/Insumo/Composição da Fonte, muda em TODAS as planilhas que usam essa Fonte. Se
                você alterar um Parâmetro, muda em TODAS as planilhas que usam esse Parâmetro.
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <label className="space-y-1">
                  <div className="text-sm font-semibold">Nome</div>
                  <input className="input bg-white w-full" value={novaPlanilhaNome} onChange={(e) => setNovaPlanilhaNome(e.target.value)} disabled={loading} />
                </label>

                <label className="space-y-1">
                  <div className="text-sm font-semibold">Clonar</div>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={modalNovaPlanilhaMode === "CLONAR"}
                      onChange={(e) => setModalNovaPlanilhaMode(e.target.checked ? "CLONAR" : "NOVA")}
                      disabled={loading}
                    />
                    <span className="text-sm text-slate-700">Clonar de outra planilha</span>
                  </div>
                </label>
              </div>

              {modalNovaPlanilhaMode === "CLONAR" ? (
                <label className="space-y-1 block">
                  <div className="text-sm font-semibold">Planilha origem</div>
                  <select className="input bg-white w-full" value={novaPlanilhaClonarDeId} onChange={(e) => setNovaPlanilhaClonarDeId(e.target.value)} disabled={loading}>
                    <option value="">Selecione…</option>
                    {versoes.map((v) => (
                      <option key={v.idPlanilha} value={String(v.idPlanilha)}>
                        {`v${v.numeroVersao} • ${v.nome}`}
                      </option>
                    ))}
                  </select>
                  <div className="text-xs text-slate-500">Ao clonar, a nova planilha reutiliza o mesmo id de Fonte e o mesmo id de Parâmetros da planilha origem.</div>
                </label>
              ) : null}

              <div className="grid gap-3 md:grid-cols-2">
                <label className="space-y-1">
                  <div className="text-sm font-semibold">Fonte de dados</div>
                  <select
                    className="input bg-white w-full"
                    value={novaPlanilhaFonteId}
                    onChange={(e) => setNovaPlanilhaFonteId(e.target.value)}
                    disabled={loading || modalNovaPlanilhaMode === "CLONAR"}
                  >
                    <option value="">Selecione…</option>
                    {[...fontes]
                      .sort((a, b) => Number(a.idFonteDados) - Number(b.idFonteDados))
                      .map((f) => (
                        <option key={f.idFonteDados} value={String(f.idFonteDados)}>
                          {`#${f.idFonteDados} - ${f.nome}`}
                        </option>
                      ))}
                  </select>
                </label>

                <label className="space-y-1">
                  <div className="text-sm font-semibold">Parâmetro</div>
                  <select
                    className="input bg-white w-full"
                    value={novaPlanilhaParametrosId}
                    onChange={(e) => setNovaPlanilhaParametrosId(e.target.value)}
                    disabled={loading || modalNovaPlanilhaMode === "CLONAR"}
                  >
                    <option value="">Selecione…</option>
                    {[...parametrosCad]
                      .sort((a, b) => Number(a.idParametros) - Number(b.idParametros))
                      .map((p) => (
                        <option key={p.idParametros} value={String(p.idParametros)}>
                          {`#${p.idParametros} - ${p.nome}`}
                        </option>
                      ))}
                  </select>
                </label>
              </div>

              <div className="flex items-center justify-end gap-2">
                <button
                  className="rounded-lg border bg-white px-4 py-2 text-sm hover:bg-slate-50 disabled:opacity-60"
                  type="button"
                  onClick={() => setModalNovaPlanilhaOpen(false)}
                  disabled={loading}
                >
                  Cancelar
                </button>
                <button
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-500 disabled:opacity-60"
                  type="button"
                  onClick={confirmarNovaPlanilha}
                  disabled={loading}
                >
                  Criar
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {modalClonarPlanilhaOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-2xl rounded-xl border bg-white shadow-lg">
            <div className="flex items-center justify-between gap-3 border-b p-4">
              <div className="text-lg font-semibold">Clonar planilha</div>
              <button
                className="rounded-lg border bg-white px-2 py-2 text-sm hover:bg-slate-50 disabled:opacity-60"
                type="button"
                onClick={() => setModalClonarPlanilhaOpen(false)}
                disabled={loading}
                title="Fechar"
              >
                <XCircle className="h-5 w-5" />
              </button>
            </div>
            <div className="p-4 space-y-4">
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                Atenção: Fonte de dados e Parâmetros podem ser compartilhados. Alterações na Fonte/Parâmetros podem impactar outras planilhas que usam o mesmo id.
              </div>

              <div className="space-y-3">
                <label className="flex items-start gap-3">
                  <input type="checkbox" checked disabled />
                  <div>
                    <div className="font-semibold">Planilha</div>
                    <div className="text-sm text-slate-700">Itens (itens, subitens e serviços) e preços de insumos.</div>
                  </div>
                </label>

                <label className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={clonarIncludeParametros}
                    onChange={(e) => setClonarIncludeParametros(Boolean(e.target.checked))}
                    disabled={loading}
                  />
                  <div>
                    <div className="font-semibold">Parâmetros da planilha</div>
                    <div className="text-sm text-slate-700">UF (SINAPI), Data-base, BDI de Serviços (%), BDI Diferenciado (%), Enc. Sociais (%), Desconto (%).</div>
                    <div className="text-xs text-slate-500">Marcado = cria um novo cadastro de Parâmetros com os mesmos valores (não fica compartilhado).</div>
                  </div>
                </label>

                <label className="flex items-start gap-3">
                  <input type="checkbox" checked={clonarIncludeFonte} onChange={(e) => setClonarIncludeFonte(Boolean(e.target.checked))} disabled={loading} />
                  <div>
                    <div className="font-semibold">Fonte de dados da planilha</div>
                    <div className="text-sm text-slate-700">Serviços, composições, insumos.</div>
                    <div className="text-xs text-slate-500">Marcado = cria uma nova Fonte (catálogo) clonando Serviços/Insumos/Composições.</div>
                  </div>
                </label>
              </div>

              <div className="flex items-center justify-end gap-2">
                <button
                  className="rounded-lg border bg-white px-4 py-2 text-sm hover:bg-slate-50 disabled:opacity-60"
                  type="button"
                  onClick={() => setModalClonarPlanilhaOpen(false)}
                  disabled={loading}
                >
                  Cancelar
                </button>
                <button
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-500 disabled:opacity-60"
                  type="button"
                  onClick={confirmarClonarPlanilha}
                  disabled={loading || !clonarTarget}
                >
                  Clonar
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {modalEditarPlanilhaOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-2xl rounded-xl border bg-white shadow-lg">
            <div className="flex items-center justify-between gap-3 border-b p-4">
              <div className="text-lg font-semibold">Editar planilha</div>
              <button
                className="rounded-lg border bg-white px-2 py-2 text-sm hover:bg-slate-50 disabled:opacity-60"
                type="button"
                onClick={() => setModalEditarPlanilhaOpen(false)}
                disabled={loading}
                title="Fechar"
              >
                <XCircle className="h-5 w-5" />
              </button>
            </div>
            <div className="p-4 space-y-4">
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                Atenção: Fonte de dados e Parâmetros são compartilhados. Se você alterar Serviço/Insumo/Composição da Fonte, muda em TODAS as planilhas que usam essa Fonte. Se
                você alterar um Parâmetro, muda em TODAS as planilhas que usam esse Parâmetro.
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <label className="space-y-1">
                  <div className="text-sm font-semibold">Nome</div>
                  <input className="input bg-white w-full" value={editarPlanilhaNome} onChange={(e) => setEditarPlanilhaNome(e.target.value)} disabled={loading} />
                </label>

                <label className="space-y-1">
                  <div className="text-sm font-semibold">Número da versão</div>
                  <input
                    className="input bg-white w-full"
                    value={editarPlanilhaNumeroVersao}
                    onChange={(e) => setEditarPlanilhaNumeroVersao(e.target.value)}
                    disabled={loading}
                    inputMode="numeric"
                  />
                </label>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <label className="space-y-1">
                  <div className="text-sm font-semibold">Fonte de dados</div>
                  <select className="input bg-white w-full" value={editarPlanilhaFonteId} onChange={(e) => setEditarPlanilhaFonteId(e.target.value)} disabled={loading}>
                    <option value="">Selecione…</option>
                    {[...fontes]
                      .sort((a, b) => Number(a.idFonteDados) - Number(b.idFonteDados))
                      .map((f) => (
                        <option key={f.idFonteDados} value={String(f.idFonteDados)}>
                          {`#${f.idFonteDados} - ${f.nome}`}
                        </option>
                      ))}
                  </select>
                </label>

                <label className="space-y-1">
                  <div className="text-sm font-semibold">Parâmetro</div>
                  <select className="input bg-white w-full" value={editarPlanilhaParametrosId} onChange={(e) => setEditarPlanilhaParametrosId(e.target.value)} disabled={loading}>
                    <option value="">Selecione…</option>
                    {[...parametrosCad]
                      .sort((a, b) => Number(a.idParametros) - Number(b.idParametros))
                      .map((p) => (
                        <option key={p.idParametros} value={String(p.idParametros)}>
                          {`#${p.idParametros} - ${p.nome}`}
                        </option>
                      ))}
                  </select>
                </label>
              </div>

              <div className="flex items-center justify-between gap-2 flex-wrap">
                <button
                  className="rounded-lg border bg-white px-4 py-2 text-sm hover:bg-slate-50 disabled:opacity-60"
                  type="button"
                  onClick={async () => {
                    if (!editarPlanilhaTarget) return;
                    setModalEditarPlanilhaOpen(false);
                    await clonarPlanilha(editarPlanilhaTarget);
                  }}
                  disabled={loading || !editarPlanilhaTarget}
                  title="Clonar esta planilha (duplica itens e preços de insumos; reusa fonte e parâmetros por id)"
                >
                  Clonar
                </button>
                <div className="flex items-center justify-end gap-2">
                  <button
                    className="rounded-lg border bg-white px-4 py-2 text-sm hover:bg-slate-50 disabled:opacity-60"
                    type="button"
                    onClick={() => setModalEditarPlanilhaOpen(false)}
                    disabled={loading}
                  >
                    Cancelar
                  </button>
                  <button
                    className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-500 disabled:opacity-60"
                    type="button"
                    onClick={confirmarEditarPlanilha}
                    disabled={loading}
                  >
                    Salvar
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex-1 min-w-[260px]">
          <PageLoadStatusBadge loading={bootLoading || loading} done={bootDone && !bootLoading && !loading} />
          <div className="text-xs text-slate-500">{breadcrumb}</div>
          <h1 className="text-2xl font-semibold">Planilha orçamentária — Obra #{idObra}</h1>
          {obraResumo ? (
            <div className="mt-2 text-sm text-slate-700">
              <span className="font-semibold">{obraResumo.nome ? obraResumo.nome : `Obra #${idObra}`}</span>
              {" • "}
              <span>Status: {obraResumo.status ? obraResumo.status : "—"}</span>
              {" • "}
              <span>Contrato: {obraResumo.contratoNumero ? obraResumo.contratoNumero : obraResumo.contratoId ? `#${obraResumo.contratoId}` : "—"}</span>
              {(obraResumo.valorPrevisto != null || (diffPrevistoPlanilha != null && Math.abs(diffPrevistoPlanilha) >= 0.01)) ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {obraResumo.valorPrevisto != null ? (
                    <div className="rounded-lg border bg-white px-3 py-2" title="Valor previsto cadastrado para a obra (referência gerencial)">
                      <div className="text-[11px] uppercase tracking-wide text-slate-500">Valor previsto</div>
                      <div className="text-sm font-semibold text-slate-900">{moeda(Number(obraResumo.valorPrevisto || 0))}</div>
                    </div>
                  ) : null}
                  {diffPrevistoPlanilha != null && Math.abs(diffPrevistoPlanilha) >= 0.01 ? (
                    <div
                      className="rounded-lg border bg-white px-3 py-2"
                      title="Diferença entre o valor previsto da obra e o valor total calculado na planilha selecionada"
                    >
                      <div className="text-[11px] uppercase tracking-wide text-slate-500">Diferença (previsto - planilha)</div>
                      <div className="text-sm font-semibold text-red-700">{moeda(Number(diffPrevistoPlanilha || 0))}</div>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="flex items-center justify-end gap-2 flex-wrap">
            <button
              className="rounded-lg border bg-blue-600 px-4 py-2 text-sm text-white border-blue-600 hover:bg-blue-500 disabled:opacity-60"
              type="button"
              onClick={() => router.push(selfHref)}
              disabled={loading}
              title="Você está na tela Planilha orçamentária"
            >
              Planilha
            </button>
            <button
              className="rounded-lg border bg-white px-4 py-2 text-sm hover:bg-slate-50 disabled:opacity-60"
              type="button"
              onClick={() => {
                const qs = new URLSearchParams();
                if (effectivePlanilhaId) qs.set("planilhaId", String(effectivePlanilhaId));
                qs.set("returnTo", selfHref);
                router.push(`/dashboard/engenharia/obras/${idObra}/planilha/servicos?${qs.toString()}`);
              }}
              disabled={loading || !effectivePlanilhaId || !planilha}
              title={!effectivePlanilhaId || !planilha ? "Selecione uma versão da planilha para abrir o catálogo da Fonte" : "Abrir o catálogo de serviços da Fonte de dados vinculada à planilha selecionada"}
            >
              Serviços (catálogo da fonte)
            </button>
            <button
              className="rounded-lg border bg-white px-4 py-2 text-sm hover:bg-slate-50 disabled:opacity-60"
              type="button"
              onClick={() => {
                const qs = new URLSearchParams();
                if (effectivePlanilhaId) qs.set("planilhaId", String(effectivePlanilhaId));
                qs.set("returnTo", selfHref);
                router.push(`/dashboard/engenharia/obras/${idObra}/planilha/sinapi?${qs.toString()}`);
              }}
              disabled={loading || !effectivePlanilhaId || !planilha}
              title={!effectivePlanilhaId || !planilha ? "Selecione uma versão da planilha para abrir o SINAPI" : "Abrir a tela SINAPI para importar/aplicar serviços e composições"}
            >
              SINAPI
            </button>
            <button
              className="rounded-lg border bg-white px-4 py-2 text-sm hover:bg-slate-50 disabled:opacity-60"
              type="button"
              onClick={() => {
                const qs = new URLSearchParams();
                if (effectivePlanilhaId) qs.set("planilhaId", String(effectivePlanilhaId));
                qs.set("returnTo", selfHref);
                router.push(`/dashboard/engenharia/obras/${idObra}/planilha/insumos?${qs.toString()}`);
              }}
              disabled={loading || !effectivePlanilhaId || !planilha}
              title={!effectivePlanilhaId || !planilha ? "Selecione uma versão da planilha para abrir Insumos" : "Abrir a tela de Insumos consolidados da planilha selecionada"}
            >
              Insumos
            </button>
            <button
              className="rounded-lg border bg-white px-4 py-2 text-sm hover:bg-slate-50 disabled:opacity-60"
              type="button"
              onClick={() => router.push(safeReturnTo || `/dashboard/engenharia/obras/${idObra}`)}
              disabled={loading}
              title="Voltar para a obra"
            >
              Voltar
            </button>
          </div>
          <div className="flex items-center justify-end gap-2 flex-wrap">
            <button
              className="rounded-lg border bg-white px-4 py-2 text-sm hover:bg-slate-50 disabled:opacity-60"
              type="button"
              onClick={() => {
                const qs = new URLSearchParams();
                qs.set("returnTo", selfHref);
                router.push(`/dashboard/engenharia/fontes-dados?${qs.toString()}`);
              }}
              disabled={loading}
              title="Cadastrar/editar fontes de dados"
            >
              Cadastrar Fonte de dados
            </button>
            <button
              className="rounded-lg border bg-white px-4 py-2 text-sm hover:bg-slate-50 disabled:opacity-60"
              type="button"
              onClick={() => {
                const qs = new URLSearchParams();
                qs.set("returnTo", selfHref);
                router.push(`/dashboard/engenharia/planilhas/parametros?${qs.toString()}`);
              }}
              disabled={loading}
              title="Cadastrar/editar parâmetros"
            >
              Cadastrar Parâmetro
            </button>
          </div>
        </div>
      </div>

      {okMsg ? <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">{okMsg}</div> : null}
      {err ? <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div> : null}

      <section className="rounded-xl border bg-white p-4 shadow-sm space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="text-lg font-semibold">Versões cadastradas</div>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              className="rounded-lg border bg-white px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-60"
              type="button"
              onClick={() => {
                carregarVersoes();
                carregarComposicaoStatus(planilhaId);
                carregarComposicaoValidacao(planilhaId);
              }}
              disabled={loading}
              title="Recarregar a lista de versões e os indicadores da planilha selecionada"
            >
              Atualizar
            </button>
            <button
              className="rounded-lg border bg-white px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-60"
              type="button"
              onClick={() =>
                router.push(
                  `/dashboard/engenharia/obras/${idObra}/planilha/importacoes?planilhaId=${encodeURIComponent(String(effectivePlanilhaId || ""))}&returnTo=${encodeURIComponent(
                    selfHref
                  )}`
                )
              }
              disabled={loading || !podeEditar}
              title="Importações"
            >
              Importações
            </button>
            <button
              className="rounded-lg bg-blue-600 px-3 py-2 text-sm text-white hover:bg-blue-500 disabled:opacity-60"
              type="button"
              onClick={criarNovaVersao}
              disabled={loading || !podeEditar}
              title={!podeEditar ? "Criar nova versão somente na versão atual" : "Nova planilha"}
            >
              Nova planilha
            </button>
          </div>
        </div>
        <div className="overflow-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-700">
              <tr>
                <th className="px-3 py-2">Versão</th>
                <th className="px-3 py-2">Nome</th>
                <th className="px-3 py-2">Fonte</th>
                <th className="px-3 py-2">Parâmetros</th>
                <th className="px-3 py-2 text-right">Serviços</th>
                <th className="px-3 py-2 text-right">Valor total</th>
                <th className="px-3 py-2">Atual</th>
                <th className="px-3 py-2">Ações</th>
              </tr>
            </thead>
            <tbody>
              {versoes.map((v) => (
                <tr
                  key={v.idPlanilha}
                  className={`border-t cursor-pointer ${planilhaId === v.idPlanilha ? "bg-blue-50" : "hover:bg-slate-50"}`}
                  onClick={() => setPlanilhaId(v.idPlanilha)}
                >
                  <td className="px-3 py-2 font-semibold">v{v.numeroVersao}</td>
                  <td className="px-3 py-2">{v.nome}</td>
                  <td className="px-3 py-2">{v.fonteNome || "—"}</td>
                  <td className="px-3 py-2">{v.idParametros ? `#${v.idParametros} - ${v.parametrosNome || "—"}` : "—"}</td>
                  <td className="px-3 py-2 text-right">{v.totalServicos}</td>
                  <td className="px-3 py-2 text-right">{moeda(Number(v.valorTotal || 0))}</td>
                  <td className="px-3 py-2">
                    {v.atual ? (
                      <span className="inline-flex items-center gap-2 text-green-700">
                        <Check className="h-4 w-4" />
                        Atual
                      </span>
                    ) : (
                      <button
                        className="rounded border bg-white px-2 py-1 text-xs hover:bg-slate-50 disabled:opacity-60"
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          definirPlanilhaComoAtual(v.idPlanilha);
                        }}
                        disabled={loading}
                        title="Definir esta versão como Atual (padrão da obra)"
                      >
                        Definir atual
                      </button>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <button
                        className="inline-flex items-center gap-1 rounded border bg-white px-2 py-1 text-xs hover:bg-slate-50 disabled:opacity-60"
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          clonarPlanilha(v);
                        }}
                        disabled={loading}
                        title="Clonar planilha (duplica itens e preços de insumos; reusa catálogo/composições da fonte)"
                      >
                        <FileSpreadsheet className="h-3.5 w-3.5" />
                        Clonar
                      </button>
                      <button
                        className="inline-flex items-center gap-1 rounded border bg-white px-2 py-1 text-xs hover:bg-slate-50 disabled:opacity-60"
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          editarVersao(v);
                        }}
                        disabled={loading}
                        title="Editar versão"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        Editar
                      </button>
                      <button
                        className="inline-flex items-center gap-1 rounded border border-red-200 bg-white px-2 py-1 text-xs text-red-700 hover:bg-red-50 disabled:opacity-60"
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          excluirPlanilha(v);
                        }}
                        disabled={loading}
                        title="Excluir planilha"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Excluir
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {!versoes.length ? (
                <tr>
                  <td colSpan={8} className="px-3 py-6 text-center text-slate-500">
                    Nenhuma versão cadastrada.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      {planilha ? (
        <>
          <section className="rounded-xl border bg-white p-4 shadow-sm space-y-3">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <div className="text-lg font-semibold">
                  Visualizando: v{planilha.numeroVersao} {planilha.atual ? "(atual)" : "(obsoleta)"}
                </div>
                <div className="text-sm text-slate-600">Edição por planilha selecionada. No serviço, o valor unitário vem da composição (se não houver composição definida, é 0). Pressione Esc para cancelar uma edição.</div>
              </div>
            </div>
          </section>

          <div className="rounded-xl border bg-white p-3 shadow-sm">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <div className="text-slate-600">Navegação</div>
              <button
                className="rounded-lg border bg-white px-4 py-2 text-sm hover:bg-slate-50"
                type="button"
                onClick={() => {
                  setShowParamsCard((v) => !v);
                  scrollToRef(paramsSectionRef);
                }}
              >
                {showParamsCard ? "⯆" : "⯈"} Parâmetros
              </button>
              <button
                className="rounded-lg border bg-white px-4 py-2 text-sm hover:bg-slate-50"
                type="button"
                onClick={() => {
                  setShowPlanilhaCard((v) => !v);
                  scrollToRef(planilhaSectionRef);
                }}
              >
                {showPlanilhaCard ? "⯆" : "⯈"} Planilha
              </button>
              <button
                className="rounded-lg border bg-white px-4 py-2 text-sm hover:bg-slate-50"
                type="button"
                onClick={() => {
                  setShowPlanilhaCard(true);
                  setShowAdicionarCard((v) => !v);
                  scrollToRef(adicionarLinhaRef);
                }}
              >
                {showAdicionarCard ? "⯆" : "⯈"} Adicionar linha
              </button>
            </div>
          </div>

          <div ref={paramsSectionRef}>
            <section className="rounded-xl border bg-white p-4 shadow-sm space-y-3">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2">
                  <button className="rounded border bg-white px-2 py-1 text-sm hover:bg-slate-50" type="button" onClick={() => setShowParamsCard((v) => !v)}>
                    {showParamsCard ? "⯆" : "⯈"}
                  </button>
                  <div className="text-lg font-semibold">Parâmetros da planilha</div>
                </div>
              </div>
              {showParamsCard ? (
                <>
                  <div className="text-sm text-slate-700">
                    Parâmetro vinculado:{" "}
                    <span className="font-semibold">
                      {planilha.idParametros ? `#${planilha.idParametros} - ${planilha.parametrosNome || planilha.parametros?.nome || "—"}` : "—"}
                    </span>
                  </div>
                  <div className="overflow-auto">
                    <table className="min-w-full text-sm">
                      <thead className="bg-slate-50 text-left text-slate-700">
                        <tr>
                          <th className="px-3 py-2">Parâmetros</th>
                          <th className="px-3 py-2">SBC</th>
                          <th className="px-3 py-2">SINAPI</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr className="border-t">
                          <td className="px-3 py-2">UF (SINAPI)</td>
                          <td className="px-3 py-2 text-slate-500">—</td>
                          <td className="px-3 py-2">{planilha.parametros?.ufSinapi ? String(planilha.parametros.ufSinapi) : "—"}</td>
                        </tr>
                        <tr className="border-t">
                          <td className="px-3 py-2">Data-base</td>
                          <td className="px-3 py-2">{planilha.parametros?.dataBaseSbc ? String(planilha.parametros.dataBaseSbc) : "—"}</td>
                          <td className="px-3 py-2">{planilha.parametros?.dataBaseSinapi ? String(planilha.parametros.dataBaseSinapi) : "—"}</td>
                        </tr>
                        <tr className="border-t">
                          <td className="px-3 py-2">BDI de Serviços (%)</td>
                          <td className="px-3 py-2">{planilha.parametros?.bdiServicosSbc == null ? "—" : String(planilha.parametros.bdiServicosSbc)}</td>
                          <td className="px-3 py-2">{planilha.parametros?.bdiServicosSinapi == null ? "—" : String(planilha.parametros.bdiServicosSinapi)}</td>
                        </tr>
                        <tr className="border-t">
                          <td className="px-3 py-2">BDI Diferenciado (%)</td>
                          <td className="px-3 py-2">{planilha.parametros?.bdiDiferenciadoSbc == null ? "—" : String(planilha.parametros.bdiDiferenciadoSbc)}</td>
                          <td className="px-3 py-2">{planilha.parametros?.bdiDiferenciadoSinapi == null ? "—" : String(planilha.parametros.bdiDiferenciadoSinapi)}</td>
                        </tr>
                        <tr className="border-t">
                          <td className="px-3 py-2">Enc. Sociais (%)</td>
                          <td className="px-3 py-2">{planilha.parametros?.encSociaisSemDesSbc == null ? "—" : String(planilha.parametros.encSociaisSemDesSbc)}</td>
                          <td className="px-3 py-2">{planilha.parametros?.encSociaisSemDesSinapi == null ? "—" : String(planilha.parametros.encSociaisSemDesSinapi)}</td>
                        </tr>
                        <tr className="border-t">
                          <td className="px-3 py-2">Desconto (%)</td>
                          <td className="px-3 py-2">{planilha.parametros?.descontoSbc == null ? "—" : String(planilha.parametros.descontoSbc)}</td>
                          <td className="px-3 py-2">{planilha.parametros?.descontoSinapi == null ? "—" : String(planilha.parametros.descontoSinapi)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </>
              ) : null}
            </section>
          </div>

          <div ref={planilhaSectionRef}>
            <section className="rounded-xl border bg-white p-4 shadow-sm space-y-3">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2">
                  <button
                    className="rounded border bg-white px-2 py-1 text-sm hover:bg-slate-50"
                    type="button"
                    onClick={() => setShowPlanilhaCard((v) => !v)}
                    title={showPlanilhaCard ? "Recolher card da planilha" : "Expandir card da planilha"}
                  >
                    {showPlanilhaCard ? "⯆" : "⯈"}
                  </button>
                  <div className="text-lg font-semibold">Planilha orçamentária</div>
                </div>
                <div className="flex items-center gap-3 flex-wrap">
                  <div className="flex items-center gap-3 flex-wrap text-sm text-slate-600">
                    <div title="Quantidade de linhas visíveis na planilha selecionada">{linhasVisiveis.length} linha(s)</div>
                    <div title="Soma dos valores parciais dos itens do tipo Serviço (na planilha selecionada)">
                      Valor total: <span className="font-semibold text-slate-900">{moeda(Number(valorTotalPlanilha || 0))}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      className="rounded-lg border bg-white px-3 py-2 text-sm hover:bg-slate-50 inline-flex items-center gap-2 disabled:opacity-60"
                      type="button"
                      onClick={imprimirPlanilha}
                      disabled={loading || !planilha}
                      title="Abrir impressão da planilha"
                    >
                      <Printer className="h-4 w-4" />
                      Imprimir
                    </button>
                  <button
                    className="rounded-lg border bg-white px-3 py-2 text-sm hover:bg-slate-50 inline-flex items-center gap-2 disabled:opacity-60"
                    type="button"
                    onClick={() => setShowPrintConfig((v) => !v)}
                    disabled={loading || !planilha}
                    title="Configurar impressão"
                  >
                    <Image className="h-4 w-4" />
                  </button>
                    <button
                      className="rounded-lg border bg-white px-3 py-2 text-sm hover:bg-slate-50 inline-flex items-center gap-2 disabled:opacity-60"
                      type="button"
                      onClick={exportarCsvPlanilha}
                      disabled={loading || !planilha}
                      title="Exportar a planilha para CSV"
                    >
                      <FileSpreadsheet className="h-4 w-4" />
                      CSV
                    </button>
                  </div>
                </div>
            </div>

            {showPlanilhaCard ? (
              <>
                <div className="flex items-center justify-between gap-3 flex-wrap rounded-lg border bg-white p-3">
                  <div className="text-sm font-semibold">Visual</div>
                  <div className="flex items-center gap-3 flex-wrap">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={somenteItens} onChange={(e) => setSomenteItens(Boolean(e.target.checked))} />
                  <span className="text-slate-600">Somente itens</span>
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <span className="text-slate-600">Fonte</span>
                  <select
                    className="input bg-white"
                    value={String(uiPrefs.fontSizePx)}
                    onChange={(e) => setUiPrefs((p) => ({ ...p, fontSizePx: Number(e.target.value || 14) }))}
                  >
                    <option value="12">12</option>
                    <option value="14">14</option>
                    <option value="16">16</option>
                    <option value="18">18</option>
                    <option value="20">20</option>
                  </select>
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <span className="text-slate-600">Fundo Item</span>
                  <input type="color" value={uiPrefs.itemBg} onChange={(e) => setUiPrefs((p) => ({ ...p, itemBg: e.target.value }))} />
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <span className="text-slate-600">Fundo Subitem</span>
                  <input type="color" value={uiPrefs.subitemBg} onChange={(e) => setUiPrefs((p) => ({ ...p, subitemBg: e.target.value }))} />
                </label>
                  </div>
                </div>

                {showPrintConfig ? <div className="rounded-lg border bg-white p-3 space-y-3">
                  <div className="text-sm font-semibold">Impressão — ajustes finos</div>

                  <div className="grid grid-cols-1 gap-3 md:grid-cols-12">
                    <div className="md:col-span-12">
                      <label className="flex items-center gap-2 text-sm rounded border bg-white px-3 py-2">
                        <input
                          type="checkbox"
                          checked={uiPrefs.print.includeEmpresaHeader}
                          onChange={(e) => setUiPrefs((p) => ({ ...p, print: { ...p.print, includeEmpresaHeader: Boolean(e.target.checked) } }))}
                        />
                        <span className="text-slate-700">Incluir cabeçalho padronizado da empresa na impressão</span>
                      </label>
                    </div>
                    <div className="md:col-span-5 space-y-2">
                      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Fonte do cabeçalho</div>
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                        <label className="space-y-1">
                          <div className="text-sm text-slate-600">Tipo</div>
                          <select
                            className="input bg-white"
                            value={uiPrefs.print.headerFontFamily}
                            onChange={(e) => setUiPrefs((p) => ({ ...p, print: { ...p.print, headerFontFamily: e.target.value } }))}
                          >
                            <option value="Arial">Arial</option>
                            <option value="Calibri">Calibri</option>
                            <option value="Verdana">Verdana</option>
                            <option value="Times New Roman">Times New Roman</option>
                          </select>
                        </label>

                        <div className="space-y-1">
                          <div className="text-sm text-slate-600">Tamanho</div>
                          <div className="flex items-center gap-2">
                            <button
                              className="rounded border bg-white px-3 py-2 text-sm hover:bg-slate-50"
                              type="button"
                              onClick={() => setUiPrefs((p) => ({ ...p, print: { ...p.print, headerFontSizePx: Math.max(8, p.print.headerFontSizePx - 1) } }))}
                            >
                              ➖
                            </button>
                            <input
                              className="input bg-white w-[110px]"
                              type="number"
                              min={8}
                              max={16}
                              value={uiPrefs.print.headerFontSizePx}
                              onChange={(e) => setUiPrefs((p) => ({ ...p, print: { ...p.print, headerFontSizePx: Math.max(8, Math.min(16, Number(e.target.value || 11))) } }))}
                            />
                            <button
                              className="rounded border bg-white px-3 py-2 text-sm hover:bg-slate-50"
                              type="button"
                              onClick={() => setUiPrefs((p) => ({ ...p, print: { ...p.print, headerFontSizePx: Math.min(16, p.print.headerFontSizePx + 1) } }))}
                            >
                              ➕
                            </button>
                          </div>
                        </div>

                        <label className="space-y-1">
                          <div className="text-sm text-slate-600">Peso</div>
                          <select
                            className="input bg-white"
                            value={uiPrefs.print.headerFontWeight}
                            onChange={(e) => setUiPrefs((p) => ({ ...p, print: { ...p.print, headerFontWeight: e.target.value as any } }))}
                          >
                            <option value="normal">Normal</option>
                            <option value="semibold">Semibold</option>
                            <option value="bold">Bold</option>
                          </select>
                        </label>
                      </div>
                    </div>

                    <div className="md:col-span-7 space-y-2">
                      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Espaçamentos (px)</div>

                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                        <div className="space-y-1">
                          <div className="text-sm text-slate-600">Topo → cabeçalho</div>
                          <div className="flex items-center gap-2">
                            <button
                              className="rounded border bg-white px-3 py-2 text-sm hover:bg-slate-50"
                              type="button"
                              onClick={() => setUiPrefs((p) => ({ ...p, print: { ...p.print, topToHeaderPx: Math.max(0, p.print.topToHeaderPx - 2) } }))}
                            >
                              ➖
                            </button>
                            <input
                              className="input bg-white w-[110px]"
                              type="number"
                              min={0}
                              max={80}
                              value={uiPrefs.print.topToHeaderPx}
                              onChange={(e) => setUiPrefs((p) => ({ ...p, print: { ...p.print, topToHeaderPx: Math.max(0, Math.min(80, Number(e.target.value || 0))) } }))}
                            />
                            <button
                              className="rounded border bg-white px-3 py-2 text-sm hover:bg-slate-50"
                              type="button"
                              onClick={() => setUiPrefs((p) => ({ ...p, print: { ...p.print, topToHeaderPx: Math.min(80, p.print.topToHeaderPx + 2) } }))}
                            >
                              ➕
                            </button>
                          </div>
                        </div>

                        <div className="space-y-1">
                          <div className="text-sm text-slate-600">Cabeçalho → dados</div>
                          <div className="flex items-center gap-2">
                            <button
                              className="rounded border bg-white px-3 py-2 text-sm hover:bg-slate-50"
                              type="button"
                              onClick={() => setUiPrefs((p) => ({ ...p, print: { ...p.print, headerToDadosPx: Math.max(0, p.print.headerToDadosPx - 2) } }))}
                            >
                              ➖
                            </button>
                            <input
                              className="input bg-white w-[110px]"
                              type="number"
                              min={0}
                              max={80}
                              value={uiPrefs.print.headerToDadosPx}
                              onChange={(e) => setUiPrefs((p) => ({ ...p, print: { ...p.print, headerToDadosPx: Math.max(0, Math.min(80, Number(e.target.value || 0))) } }))}
                            />
                            <button
                              className="rounded border bg-white px-3 py-2 text-sm hover:bg-slate-50"
                              type="button"
                              onClick={() => setUiPrefs((p) => ({ ...p, print: { ...p.print, headerToDadosPx: Math.min(80, p.print.headerToDadosPx + 2) } }))}
                            >
                              ➕
                            </button>
                          </div>
                        </div>

                        <div className="space-y-1">
                          <div className="text-sm text-slate-600">Dados → tabela</div>
                          <div className="flex items-center gap-2">
                            <button
                              className="rounded border bg-white px-3 py-2 text-sm hover:bg-slate-50"
                              type="button"
                              onClick={() => setUiPrefs((p) => ({ ...p, print: { ...p.print, dadosToTabelaPx: Math.max(0, p.print.dadosToTabelaPx - 4) } }))}
                            >
                              ➖
                            </button>
                            <input
                              className="input bg-white w-[110px]"
                              type="number"
                              min={0}
                              max={120}
                              value={uiPrefs.print.dadosToTabelaPx}
                              onChange={(e) => setUiPrefs((p) => ({ ...p, print: { ...p.print, dadosToTabelaPx: Math.max(0, Math.min(120, Number(e.target.value || 0))) } }))}
                            />
                            <button
                              className="rounded border bg-white px-3 py-2 text-sm hover:bg-slate-50"
                              type="button"
                              onClick={() => setUiPrefs((p) => ({ ...p, print: { ...p.print, dadosToTabelaPx: Math.min(120, p.print.dadosToTabelaPx + 4) } }))}
                            >
                              ➕
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div> : null}

            <div ref={adicionarLinhaRef} className="rounded-lg border bg-slate-50 p-3 space-y-3">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2">
                  <button className="rounded border bg-white px-2 py-1 text-sm hover:bg-slate-50" type="button" onClick={() => setShowAdicionarCard((v) => !v)}>
                    {showAdicionarCard ? "⯆" : "⯈"}
                  </button>
                  <div className="text-sm font-semibold">
                    {editingLinhaId ? (novo.tipoLinha === "SERVICO" ? "Editar serviço" : "Editar linha") : novo.tipoLinha === "SERVICO" ? "Adicionar serviço" : "Adicionar linha"}
                  </div>
                </div>
              </div>
              {showAdicionarCard ? (
                <>
                  {linhaFormErr ? <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{linhaFormErr}</div> : null}

                  {novo.tipoLinha === "SERVICO" ? (
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-10">
                      <div className="md:col-span-2">
                        <div className="text-sm text-slate-600">Tipo</div>
                        <select
                          className={`input bg-white ${linhaErrors.tipoLinha ? "border-red-300 bg-red-50" : ""}`}
                          value={novo.tipoLinha}
                          onChange={(e) => {
                            const tipoLinha = e.target.value as any;
                            setLinhaFormErr(null);
                            setNovo((p) => {
                              if (tipoLinha === "SERVICO") return applyValorParcialAuto({ ...p, tipoLinha });
                              return { ...p, tipoLinha, codigo: "", fonte: "", und: "", quant: "", valorUnitario: "", valorParcial: "" };
                            });
                            setLinhaErrors((p) => {
                              if (!("tipoLinha" in p)) return p;
                              const { tipoLinha: _, ...rest } = p as any;
                              return rest;
                            });
                          }}
                          disabled={!podeEditar}
                        >
                          <option value="ITEM">Item</option>
                          <option value="SUBITEM">Subitem</option>
                          <option value="SERVICO">Serviço</option>
                        </select>
                      </div>
                      <div>
                        <div className="text-sm text-slate-600">ITEM</div>
                        <input
                          className={`input bg-white ${linhaErrors.item ? "border-red-300 bg-red-50" : ""}`}
                          value={novo.item}
                          onChange={(e) => {
                            const v = e.target.value;
                            setLinhaFormErr(null);
                            setNovo((p) => ({ ...p, item: v }));
                            setLinhaErrors((p) => {
                              if (!("item" in p)) return p;
                              const { item: _, ...rest } = p as any;
                              return rest;
                            });
                          }}
                          disabled={!podeEditar}
                          placeholder="1.1"
                        />
                      </div>
                      <div>
                        <div className="text-sm text-slate-600">CÓDIGO</div>
                        <SearchSelect
                          value={novo.codigo}
                          options={servicosCodigoOptions}
                          inputClassName={`input bg-white ${linhaErrors.codigo ? "border-red-300 bg-red-50" : ""}`}
                          onChange={(v) => {
                            setLinhaFormErr(null);
                            setNovo((p) => {
                              const next: any = { ...p, codigo: v };
                              const match = findServicoMatch({ codigo: v, servicos: next.servicos, fonte: next.fonte });
                              if (match) {
                                next.servicos = match.servicos;
                                next.fonte = match.fonte;
                                next.und = match.und;
                              }
                              return next;
                            });
                            setLinhaErrors((p) => {
                              if (!("codigo" in p)) return p;
                              const { codigo: _, ...rest } = p as any;
                              return rest;
                            });
                            void (async () => {
                              const codigo = String(v || "").trim();
                              if (!codigo) return;
                              const info = await obterPrecoUnitarioServico(codigo, planilha?.idPlanilha ?? null);
                              const vu = info?.valorUnitario != null ? info.valorUnitario : 0;
                              setNovo((p) => {
                                if (p.tipoLinha !== "SERVICO") return p;
                                if (String(p.codigo || "").trim().toUpperCase() !== codigo.toUpperCase()) return p;
                                return applyValorParcialAuto({ ...p, valorUnitario: String(vu) });
                              });
                            })();
                          }}
                          onBlur={async () => {
                            const info = await obterPrecoUnitarioServico(novo.codigo, planilha?.idPlanilha ?? null);
                            const vu = info?.valorUnitario != null ? info.valorUnitario : 0;
                            setNovo((p) => (p.tipoLinha === "SERVICO" ? applyValorParcialAuto({ ...p, valorUnitario: String(vu) }) : p));
                          }}
                          disabled={!podeEditar}
                          placeholder="SER-0001"
                        />
                      </div>
                      <div>
                        <div className="text-sm text-slate-600">FONTE</div>
                        <div title={servicoCamposTravadosPorCatalogo ? "Campo vem do catálogo (Serviços (PLANILHA))." : undefined}>
                          <SearchSelect
                            value={novo.fonte}
                            options={servicosFonteOptions}
                            inputClassName="input bg-white"
                            onChange={(v) => {
                              setLinhaFormErr(null);
                              setNovo((p) => {
                                const next: any = { ...p, fonte: v };
                                const match = findServicoMatch({ codigo: next.codigo, servicos: next.servicos, fonte: v });
                                if (match) {
                                  next.codigo = match.codigo;
                                  next.servicos = match.servicos;
                                  next.und = match.und;
                                }
                                return next;
                              });
                            }}
                            disabled={!podeEditar || servicoCamposTravadosPorCatalogo}
                            placeholder="—"
                          />
                        </div>
                      </div>
                      <div className="md:col-span-2">
                        <div className="text-sm text-slate-600">SERVIÇOS</div>
                        <div title={servicoCamposTravadosPorCatalogo ? "Campo vem do catálogo (Serviços (PLANILHA))." : undefined}>
                          <SearchSelect
                            value={novo.servicos}
                            options={servicosDescricaoOptions}
                            inputClassName={`input bg-white ${linhaErrors.servicos ? "border-red-300 bg-red-50" : ""}`}
                            onChange={(v) => {
                              setLinhaFormErr(null);
                              const match = findServicoMatch({ codigo: novo.codigo, servicos: v, fonte: novo.fonte });
                              const codigoForFetch = match?.codigo ? String(match.codigo) : String(novo.codigo || "");
                              setNovo((p) => {
                                const next: any = { ...p, servicos: v };
                                const match = findServicoMatch({ codigo: next.codigo, servicos: v, fonte: next.fonte });
                                if (match) {
                                  next.codigo = match.codigo;
                                  next.fonte = match.fonte;
                                  next.und = match.und;
                                }
                                return next;
                              });
                              setLinhaErrors((p) => {
                                if (!("servicos" in p)) return p;
                                const { servicos: _, ...rest } = p as any;
                                return rest;
                              });
                              void (async () => {
                                const codigo = String(codigoForFetch || "").trim();
                                if (!codigo) return;
                                const info = await obterPrecoUnitarioServico(codigo, planilha?.idPlanilha ?? null);
                                const vu = info?.valorUnitario != null ? info.valorUnitario : 0;
                                setNovo((p) => {
                                  if (p.tipoLinha !== "SERVICO") return p;
                                  if (String(p.codigo || "").trim().toUpperCase() !== codigo.toUpperCase()) return p;
                                  return applyValorParcialAuto({ ...p, valorUnitario: String(vu) });
                                });
                              })();
                            }}
                            onBlur={async () => {
                              if (!String(novo.codigo || "").trim()) return;
                              const info = await obterPrecoUnitarioServico(novo.codigo, planilha?.idPlanilha ?? null);
                              const vu = info?.valorUnitario != null ? info.valorUnitario : 0;
                              setNovo((p) => (p.tipoLinha === "SERVICO" ? applyValorParcialAuto({ ...p, valorUnitario: String(vu) }) : p));
                            }}
                            disabled={!podeEditar || servicoCamposTravadosPorCatalogo}
                          />
                        </div>
                      </div>
                      <div>
                        <div className="text-sm text-slate-600">UND</div>
                        <input
                          className={`input bg-white ${linhaErrors.und ? "border-red-300 bg-red-50" : ""}`}
                          value={novo.und}
                          onChange={(e) => {
                            const v = e.target.value;
                            setLinhaFormErr(null);
                            setNovo((p) => ({ ...p, und: v }));
                            setLinhaErrors((p) => {
                              if (!("und" in p)) return p;
                              const { und: _, ...rest } = p as any;
                              return rest;
                            });
                          }}
                          disabled={!podeEditar || servicoCamposTravadosPorCatalogo}
                          title={servicoCamposTravadosPorCatalogo ? "Campo vem do catálogo (Serviços (PLANILHA))." : undefined}
                          placeholder="m²"
                        />
                      </div>
                      <div>
                        <div className="text-sm text-slate-600">QUANT.</div>
                        <input
                          className={`input bg-white ${linhaErrors.quant ? "border-red-300 bg-red-50" : ""}`}
                          value={novo.quant}
                          onChange={(e) => {
                            const v = e.target.value;
                            setLinhaFormErr(null);
                            setNovo((p) => applyValorParcialAuto({ ...p, quant: v }));
                            setLinhaErrors((p) => {
                              if (!("quant" in p) && !("valorParcial" in p)) return p;
                              const { quant: _q, valorParcial: _vp, ...rest } = p as any;
                              return rest;
                            });
                          }}
                          onBlur={() => setNovo((p) => applyValorParcialAuto({ ...p }))}
                          disabled={!podeEditar}
                        />
                      </div>
                      <div>
                        <div className="text-sm text-slate-600">VALOR UNIT.</div>
                        <input className={`input bg-white ${linhaErrors.valorUnitario ? "border-red-300 bg-red-50" : ""}`} value={novo.valorUnitario} readOnly disabled={!podeEditar} />
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-6">
                      <div className="md:col-span-2">
                        <div className="text-sm text-slate-600">Tipo</div>
                        <select
                          className={`input bg-white ${linhaErrors.tipoLinha ? "border-red-300 bg-red-50" : ""}`}
                          value={novo.tipoLinha}
                          onChange={(e) => {
                            const tipoLinha = e.target.value as any;
                            setLinhaFormErr(null);
                            setNovo((p) => {
                              if (tipoLinha === "SERVICO") return applyValorParcialAuto({ ...p, tipoLinha });
                              return { ...p, tipoLinha, codigo: "", fonte: "", und: "", quant: "", valorUnitario: "", valorParcial: "" };
                            });
                            setLinhaErrors((p) => {
                              if (!("tipoLinha" in p)) return p;
                              const { tipoLinha: _, ...rest } = p as any;
                              return rest;
                            });
                          }}
                          disabled={!podeEditar}
                        >
                          <option value="ITEM">Item</option>
                          <option value="SUBITEM">Subitem</option>
                          <option value="SERVICO">Serviço</option>
                        </select>
                      </div>
                      <div>
                        <div className="text-sm text-slate-600">ITEM</div>
                        <input
                          className={`input bg-white ${linhaErrors.item ? "border-red-300 bg-red-50" : ""}`}
                          value={novo.item}
                          onChange={(e) => {
                            const v = e.target.value;
                            setLinhaFormErr(null);
                            setNovo((p) => ({ ...p, item: v }));
                            setLinhaErrors((p) => {
                              if (!("item" in p)) return p;
                              const { item: _, ...rest } = p as any;
                              return rest;
                            });
                          }}
                          disabled={!podeEditar}
                          placeholder="1"
                        />
                      </div>
                      <div className="md:col-span-3">
                        <div className="text-sm text-slate-600">SERVIÇOS</div>
                        <input
                          className={`input bg-white ${linhaErrors.servicos ? "border-red-300 bg-red-50" : ""}`}
                          value={novo.servicos}
                          onChange={(e) => {
                            const v = e.target.value;
                            setLinhaFormErr(null);
                            setNovo((p) => ({ ...p, servicos: v }));
                            setLinhaErrors((p) => {
                              if (!("servicos" in p)) return p;
                              const { servicos: _, ...rest } = p as any;
                              return rest;
                            });
                          }}
                          disabled={!podeEditar}
                          placeholder="Ex.: SERVIÇOS PRELIMINARES"
                        />
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-1 gap-3 md:grid-cols-6">
                    <div className="md:col-span-2">
                      <div className="text-sm text-slate-600">VALOR PARCIAL</div>
                      <input
                        className={`input bg-white ${linhaErrors.valorParcial ? "border-red-300 bg-red-50" : ""}`}
                        value={
                          novo.tipoLinha === "SERVICO"
                            ? novo.valorParcial
                            : (() => {
                                const k = String(novo.item || "").trim();
                                const info = k ? subtotalByItemKey.get(k) : null;
                                if (!info?.count) return "";
                                return moeda(Number(info.sum || 0));
                              })()
                        }
                        readOnly
                        disabled={!podeEditar}
                      />
                    </div>
                    <div className="md:col-span-4 flex items-end justify-end">
                      <div className="flex items-center gap-2">
                        {editingLinhaId ? (
                          <button
                            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm text-slate-800 disabled:opacity-60"
                            type="button"
                            onClick={() => {
                              resetLinhaForm();
                            }}
                            disabled={loading}
                          >
                            Cancelar edição
                          </button>
                        ) : null}
                        <button className="rounded-lg bg-green-600 px-4 py-2 text-sm text-white disabled:opacity-60" type="button" onClick={salvarLinha} disabled={loading || !podeEditar}>
                          {editingLinhaId ? "Atualizar linha" : "Salvar linha"}
                        </button>
                      </div>
                    </div>
                  </div>
                </>
              ) : null}
            </div>

            <div className="overflow-auto">
              <table className="min-w-[1100px] w-full" style={{ fontSize: `${uiPrefs.fontSizePx}px` }}>
                <thead className="bg-slate-50 text-left text-slate-700">
                  <tr>
                    <th className="px-3 py-2 w-[36px] border-r border-slate-200">ITEM</th>
                    <th className="px-3 py-2 w-[118px] border-r border-slate-200">CÓDIGO</th>
                    <th className="px-3 py-2 border-r border-slate-200">FONTE</th>
                    <th className="px-3 py-2 min-w-[374px] border-r border-slate-200">SERVIÇOS</th>
                    <th className="px-3 py-2 border-r border-slate-200">UND</th>
                    <th className="px-3 py-2 text-right border-r border-slate-200">QUANT.</th>
                    <th className="px-3 py-2 text-right border-r border-slate-200">VALOR UNIT.</th>
                    <th className="px-3 py-2 text-right border-r border-slate-200">VALOR PARCIAL</th>
                    <th className="px-3 py-2">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {linhasVisiveis.map((l) => (
                    <tr
                      key={l.idLinha}
                      className={`border-t ${l.tipoLinha === "ITEM" || l.tipoLinha === "SUBITEM" ? "font-bold" : ""}`}
                      style={{
                        backgroundColor: l.tipoLinha === "ITEM" ? uiPrefs.itemBg : l.tipoLinha === "SUBITEM" ? uiPrefs.subitemBg : undefined,
                      }}
                      onDoubleClick={() => {
                        if (l.tipoLinha !== "SERVICO") return;
                        const code = String(l.codigo || "").trim();
                        if (!code) return;
                        const qs = new URLSearchParams();
                        if (effectivePlanilhaId) qs.set("planilhaId", String(effectivePlanilhaId));
                        qs.set("returnTo", selfHref);
                        router.push(
                          `/dashboard/engenharia/obras/${idObra}/planilha/servicos/${encodeURIComponent(code)}?${qs.toString()}`
                        );
                      }}
                    >
                      <td className="px-3 py-2 w-[36px] border-r border-slate-200">
                        <span className="inline-flex items-center gap-2">
                          {l.tipoLinha === "ITEM" || l.tipoLinha === "SUBITEM" ? (
                            expandablePrefixes.has(String(l.item || "").trim()) ? (
                              <button
                                className="rounded border bg-white px-2 py-0.5 text-xs hover:bg-slate-50"
                                type="button"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  toggleCollapsedPrefix(String(l.item || "").trim());
                                }}
                              >
                                {collapsedPrefixes.has(String(l.item || "").trim()) ? "⯈" : "⯆"}
                              </button>
                            ) : (
                              <span className="inline-block w-[30px]" />
                            )
                          ) : (
                            <span className="inline-block w-[30px]" />
                          )}
                          <span>{l.item || ""}</span>
                        </span>
                      </td>
                      <td className="px-3 py-2 w-[118px] max-w-[118px] whitespace-nowrap overflow-hidden text-ellipsis border-r border-slate-200">
                        <span className="inline-flex items-center gap-2">
                          <span className="text-[11px]">{l.codigo || ""}</span>
                          {(() => {
                            if (l.tipoLinha !== "SERVICO") return null;
                            const code = String(l.codigo || "").trim().toUpperCase();
                            if (!code) return null;
                            const v = composicaoValidacaoByCodigo[code];
                            if (!v) return composicaoServicoCodes.has(code) ? <Check className="h-4 w-4 text-green-600" /> : null;
                            if (v.status === "SEM_COMPOSICAO")
                              return (
                                <span title="Sem composição">
                                  <XCircle className="h-4 w-4 text-red-600" />
                                </span>
                              );
                            if (v.status === "DIVERGENTE")
                              return (
                                <span
                                  className="inline-flex items-center gap-1 rounded border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800"
                                  title={`Planilha: ${moeda(Number(v.totalPlanilha || 0))} | Composição: ${moeda(Number(v.totalComposicao || 0))} | Dif.: ${moeda(Number(v.diff || 0))}`}
                                >
                                  <TriangleAlert className="h-3.5 w-3.5" />
                                  Diverg.
                                </span>
                              );
                            return <Check className="h-4 w-4 text-green-600" />;
                          })()}
                        </span>
                      </td>
                      <td className="px-3 py-2 border-r border-slate-200">{l.fonte || ""}</td>
                      <td className="px-3 py-2 min-w-[374px] border-r border-slate-200">{l.servicos || ""}</td>
                      <td className="px-3 py-2 border-r border-slate-200">{l.und || ""}</td>
                      <td className="px-3 py-2 text-right border-r border-slate-200">{l.quant || ""}</td>
                      <td className="px-3 py-2 text-right border-r border-slate-200">{l.valorUnitario || ""}</td>
                      <td className="px-3 py-2 text-right border-r border-slate-200">
                        {l.tipoLinha === "ITEM" || l.tipoLinha === "SUBITEM"
                          ? (() => {
                              const k = String(l.item || "").trim();
                              const info = k ? subtotalByItemKey.get(k) : null;
                              if (!info?.count) return "";
                              return moeda(Number(info.sum || 0));
                            })()
                          : (() => {
                              const n = parseNumberLoose(l.valorParcial);
                              return n == null ? "" : moeda(n);
                            })()}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <button className="rounded border bg-white p-2 text-slate-800 hover:bg-slate-50 disabled:opacity-60" type="button" onClick={() => iniciarEdicaoLinha(l)} disabled={!podeEditar || loading} title="Editar">
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button className="rounded border bg-white p-2 text-red-700 hover:bg-slate-50 disabled:opacity-60" type="button" onClick={() => excluirLinha(l.idLinha)} disabled={!podeEditar || loading} title="Excluir">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {!planilha.linhas.length ? (
                    <tr>
                      <td colSpan={9} className="px-3 py-6 text-center text-slate-500">
                        Sem linhas na planilha.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
              </>
            ) : null}
          </section>
          </div>
        </>
      ) : null}
    </div>
  );
}
