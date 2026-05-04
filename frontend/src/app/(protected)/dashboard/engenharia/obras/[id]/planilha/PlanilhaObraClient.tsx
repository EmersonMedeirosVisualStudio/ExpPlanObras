"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Download, Check, Printer, FileSpreadsheet, Pencil, Trash2, XCircle, TriangleAlert, Image } from "lucide-react";

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
  origem: string;
  criadoEm: string;
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
  origem: string;
  criadoEm: string;
  parametros: {
    dataBaseSbc: string | null;
    dataBaseSinapi: string | null;
    bdiServicosSbc: number | null;
    bdiServicosSinapi: number | null;
    bdiDiferenciadoSbc: number | null;
    bdiDiferenciadoSinapi: number | null;
    encSociaisSemDesSbc: number | null;
    encSociaisSemDesSinapi: number | null;
    descontoSbc: number | null;
    descontoSinapi: number | null;
  };
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

function detectTipoLinha(item: string, und: string, quant: string, valorUnit: string) {
  const hasServ = !!(und.trim() || quant.trim() || valorUnit.trim());
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

export default function PlanilhaObraClient({ idObra, returnTo }: { idObra: number; returnTo: string | null }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [obraStatus, setObraStatus] = useState<string | null>(null);
  const [obraResumo, setObraResumo] = useState<ObraResumo | null>(null);
  const [empresaDocumentosLayout, setEmpresaDocumentosLayout] = useState<EmpresaDocumentosLayout | null>(null);
  const [versoes, setVersoes] = useState<VersaoRow[]>([]);
  const [planilha, setPlanilha] = useState<Planilha | null>(null);
  const [planilhaId, setPlanilhaId] = useState<number | null>(null);
  const [showPrintConfig, setShowPrintConfig] = useState(false);

  const safeReturnTo = useMemo(() => {
    const raw = String(returnTo || "").trim();
    const isExternal = raw.startsWith("//") || /^(?:[a-z][a-z0-9+.-]*:)?\/\//i.test(raw) || /^[a-z][a-z0-9+.-]*:/i.test(raw);
    return raw && !isExternal ? raw : null;
  }, [returnTo]);

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
    ordem: "",
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

  const [composicaoServicoCodes, setComposicaoServicoCodes] = useState<Set<string>>(new Set());
  const [composicaoValidacaoByCodigo, setComposicaoValidacaoByCodigo] = useState<Record<string, ComposicaoValidacaoRow>>({});

  const [parametros, setParametros] = useState({
    dataBaseSbc: "",
    dataBaseSinapi: "",
    ufSinapi: "",
    bdiServicosSbc: "",
    bdiServicosSinapi: "",
    bdiDiferenciadoSbc: "",
    bdiDiferenciadoSinapi: "",
    encSociaisSemDesSbc: "",
    encSociaisSemDesSinapi: "",
    descontoSbc: "",
    descontoSinapi: "",
  });

  const [paramErrors, setParamErrors] = useState<Partial<Record<keyof typeof parametros, string>>>({});
  const [linhaErrors, setLinhaErrors] = useState<Partial<Record<keyof typeof novo, string>>>({});
  const [somenteItens, setSomenteItens] = useState(false);
  const [collapsedPrefixes, setCollapsedPrefixes] = useState<Set<string>>(new Set());

  const [showParamsCard, setShowParamsCard] = useState(true);
  const [showPlanilhaCard, setShowPlanilhaCard] = useState(true);
  const [showAdicionarCard, setShowAdicionarCard] = useState(true);

  const paramsSectionRef = useRef<HTMLDivElement | null>(null);
  const planilhaSectionRef = useRef<HTMLDivElement | null>(null);
  const adicionarLinhaRef = useRef<HTMLDivElement | null>(null);

  const ufs = useMemo(
    () => [
      "AC",
      "AL",
      "AP",
      "AM",
      "BA",
      "CE",
      "DF",
      "ES",
      "GO",
      "MA",
      "MT",
      "MS",
      "MG",
      "PA",
      "PB",
      "PR",
      "PE",
      "PI",
      "RJ",
      "RN",
      "RS",
      "RO",
      "RR",
      "SC",
      "SP",
      "SE",
      "TO",
    ],
    []
  );

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

  function baixarModeloCsv() {
    const sep = ";";
    const lines = [
      ["item", "codigo", "fonte", "servicos", "und", "quant", "valor_unitario"].join(sep),
      ["1", "", "", "SERVIÇOS PRELIMINARES", "", "", ""].join(sep),
      ["1.1", "", "", "Terraplenagem", "", "", ""].join(sep),
      ["1.1.1", "SER-0001", "SINAPI", "Escavação manual", "m³", "10", "100,00"].join(sep),
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
    for (const l of planilha.linhas || []) {
      lines.push(
        [
          String(l.item || ""),
          String(l.codigo || ""),
          String(l.fonte || ""),
          String(l.servicos || ""),
          String(l.und || ""),
          String(l.quant || ""),
          String(l.valorUnitario || ""),
          String(l.valorParcial || ""),
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
    const rowsHtml = (planilha.linhas || [])
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
                  <td class="p-k">Enc. Sociais SEM Desoneração:</td>
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
        origem: String(v.origem || "MANUAL"),
        criadoEm: String(v.criadoEm || ""),
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
      const res = await authFetch(`/api/v1/engenharia/obras/${idObra}/planilha?planilhaId=${idPlanilha}`);
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.message || "Erro ao carregar planilha");
      const data = json.data || {};
      setObraStatus(data.obraStatus ?? null);
      setObraResumo((data.obra as any) || null);
      setPlanilha((data.planilha as any) || null);
      const p = (data.planilha?.parametros || {}) as any;
      setParametros({
        dataBaseSbc: p.dataBaseSbc ?? "",
        dataBaseSinapi: p.dataBaseSinapi ?? "",
        ufSinapi: p.ufSinapi ?? "",
        bdiServicosSbc: p.bdiServicosSbc == null ? "" : String(p.bdiServicosSbc),
        bdiServicosSinapi: p.bdiServicosSinapi == null ? "" : String(p.bdiServicosSinapi),
        bdiDiferenciadoSbc: p.bdiDiferenciadoSbc == null ? "" : String(p.bdiDiferenciadoSbc),
        bdiDiferenciadoSinapi: p.bdiDiferenciadoSinapi == null ? "" : String(p.bdiDiferenciadoSinapi),
        encSociaisSemDesSbc: p.encSociaisSemDesSbc == null ? "" : String(p.encSociaisSemDesSbc),
        encSociaisSemDesSinapi: p.encSociaisSemDesSinapi == null ? "" : String(p.encSociaisSemDesSinapi),
        descontoSbc: p.descontoSbc == null ? "" : String(p.descontoSbc),
        descontoSinapi: p.descontoSinapi == null ? "" : String(p.descontoSinapi),
      });
    } catch (e: any) {
      setErr(e?.message || "Erro ao salvar item");
    } finally {
      setLoading(false);
    }
  }

  async function carregarComposicaoStatus() {
    try {
      const res = await authFetch(`/api/v1/engenharia/obras/${idObra}/planilha/composicoes/status`);
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
    carregarVersoes();
    carregarComposicaoStatus();
    carregarEmpresaDocumentosLayout();
  }, [idObra]);

  useEffect(() => {
    if (planilhaId) carregarPlanilha(planilhaId);
    carregarComposicaoValidacao(planilhaId);
  }, [planilhaId]);

  if (!idObra) return <div className="p-6 rounded-xl border bg-white">Obra inválida.</div>;

  async function criarNovaVersao() {
    try {
      setLoading(true);
      setErr(null);
      const res = await authFetch(`/api/v1/engenharia/obras/${idObra}/planilha`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "NOVA_VERSAO", nome: `Versão ${Math.max(0, ...versoes.map((v) => v.numeroVersao)) + 1}` }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.message || "Erro ao criar nova versão");
      const idPlanilhaNew = Number(json.data?.idPlanilha || 0);
      await carregarVersoes();
      if (idPlanilhaNew) setPlanilhaId(idPlanilhaNew);
    } catch (e: any) {
      setErr(e?.message || "Erro ao criar nova versão");
    } finally {
      setLoading(false);
    }
  }

  async function salvarParametros() {
    if (!planilha) return;
    try {
      setOkMsg(null);
      const nextErrors: Partial<Record<keyof typeof parametros, string>> = {};
      const numericKeys: Array<keyof typeof parametros> = [
        "bdiServicosSbc",
        "bdiServicosSinapi",
        "bdiDiferenciadoSbc",
        "bdiDiferenciadoSinapi",
        "encSociaisSemDesSbc",
        "encSociaisSemDesSinapi",
        "descontoSbc",
        "descontoSinapi",
      ];
      for (const k of numericKeys) {
        const v = String((parametros as any)[k] ?? "").trim();
        if (!v) continue;
        if (parseNumberLoose(v) == null) nextErrors[k] = "Número inválido";
      }
      setParamErrors(nextErrors);
      if (Object.keys(nextErrors).length) {
        setErr("Corrija os campos destacados antes de salvar.");
        return;
      }
      setLoading(true);
      setErr(null);
      const res = await authFetch(`/api/v1/engenharia/obras/${idObra}/planilha`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "ATUALIZAR_PARAMETROS",
          idPlanilha: planilha.idPlanilha,
          parametros: {
            dataBaseSbc: parametros.dataBaseSbc || null,
            dataBaseSinapi: parametros.dataBaseSinapi || null,
            ufSinapi: parametros.ufSinapi || null,
            bdiServicosSbc: parametros.bdiServicosSbc || null,
            bdiServicosSinapi: parametros.bdiServicosSinapi || null,
            bdiDiferenciadoSbc: parametros.bdiDiferenciadoSbc || null,
            bdiDiferenciadoSinapi: parametros.bdiDiferenciadoSinapi || null,
            encSociaisSemDesSbc: parametros.encSociaisSemDesSbc || null,
            encSociaisSemDesSinapi: parametros.encSociaisSemDesSinapi || null,
            descontoSbc: parametros.descontoSbc || null,
            descontoSinapi: parametros.descontoSinapi || null,
          },
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.message || "Erro ao salvar parâmetros");
      await carregarPlanilha(planilha.idPlanilha);
      await carregarVersoes();
      setOkMsg("Parâmetros salvos com sucesso.");
    } catch (e: any) {
      setErr(e?.message || "Erro ao salvar parâmetros");
    } finally {
      setLoading(false);
    }
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
    if (next.tipoLinha === "SERVICO") {
      if (!String(next.codigo || "").trim()) errors.codigo = "Obrigatório";
      if (!String(next.und || "").trim()) errors.und = "Obrigatório";
      const q = parseNumberLoose(next.quant);
      if (q == null || !(q > 0)) errors.quant = "Inválido";
      const v = parseNumberLoose(next.valorUnitario);
      if (v == null || !(v >= 0)) errors.valorUnitario = "Inválido";
      const vp = calcValorParcialLinha(next.quant, next.valorUnitario);
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
      const normalized = applyValorParcialAuto({ ...novo });
      const nextErrors = validateLinha(normalized);
      setLinhaErrors(nextErrors);
      if (Object.keys(nextErrors).length) {
        setErr("Corrija os campos destacados antes de salvar.");
        setLoading(false);
        return;
      }
      const ordem = Number(normalized.ordem || 0) || ((planilha.linhas || []).reduce((m, l) => Math.max(m, Number(l.ordem || 0)), 0) + 1);
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
      setNovo({ tipoLinha: "SERVICO", ordem: "", item: "", codigo: "", fonte: "", servicos: "", und: "", quant: "", valorUnitario: "", valorParcial: "" });
      setEditingLinhaId(null);
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
    setEditingLinhaId(Number(l.idLinha));
    setNovo({
      tipoLinha: (l.tipoLinha as any) || "SERVICO",
      ordem: l.ordem == null ? "" : String(l.ordem),
      item: String(l.item || ""),
      codigo: String(l.codigo || ""),
      fonte: String(l.fonte || ""),
      servicos: String(l.servicos || ""),
      und: String(l.und || ""),
      quant: String(l.quant || ""),
      valorUnitario: String(l.valorUnitario || ""),
      valorParcial: String(l.valorParcial || ""),
    });
    setLinhaErrors({});
    setOkMsg(null);
    setShowPlanilhaCard(true);
    setShowAdicionarCard(true);
    scrollToRef(adicionarLinhaRef);
  }

  async function importarCsv(file: File, nomeVersao?: string) {
    try {
      setLoading(true);
      setErr(null);
      const form = new FormData();
      form.append("action", "IMPORTAR_CSV");
      form.append("nome", String(nomeVersao || `Versão ${Math.max(0, ...versoes.map((v) => v.numeroVersao)) + 1} (CSV)`));
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
        const det = detectTipoLinha(item, und, quant, valorUnitario);
        const quantidade = toDec(quant);
        const vUnit = toDec(valorUnitario);
        const valorParcialCalc = quantidade != null && vUnit != null ? Number((quantidade * vUnit).toFixed(6)) : null;

        const errors: any = {};
        if (!item.trim()) errors.item = "Obrigatório";
        if (!servicos.trim()) errors.servicos = "Obrigatório";

        if (det.tipo === "SERVICO") {
          if (!codigo.trim()) errors.codigo = "Obrigatório (serviço)";
          if (!und.trim()) errors.und = "Obrigatório (serviço)";
          if (quantidade == null || !(quantidade > 0)) errors.quant = "Inválido (serviço)";
          if (vUnit == null || !(vUnit >= 0)) errors.valorUnitario = "Inválido (serviço)";
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

  const subtotalByItemKey = useMemo(() => {
    const map = new Map<string, number>();
    const rows = planilha?.linhas || [];
    for (const l of rows) {
      if (String(l.tipoLinha || "").toUpperCase() !== "SERVICO") continue;
      const itemStr = String(l.item || "").trim();
      if (!itemStr) continue;
      const v = parseNumberLoose(l.valorParcial);
      if (v == null) continue;
      const parts = itemStr.split(".").map((p) => p.trim()).filter(Boolean);
      if (parts.length <= 1) continue;
      for (let i = 1; i <= parts.length - 1; i++) {
        const prefix = parts.slice(0, i).join(".");
        map.set(prefix, Number(((map.get(prefix) || 0) + v).toFixed(6)));
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

  const expandablePrefixes = useMemo(() => {
    const set = new Set<string>();
    const rows = planilha?.linhas || [];
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
  }, [planilha]);

  const linhasVisiveis = useMemo(() => {
    const rows = planilha?.linhas || [];
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
  }, [planilha, somenteItens, collapsedPrefixes]);

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl text-slate-900">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex-1 min-w-[260px]">
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
                    <div className="rounded-lg border bg-white px-3 py-2">
                      <div className="text-[11px] uppercase tracking-wide text-slate-500">Valor previsto</div>
                      <div className="text-sm font-semibold text-slate-900">{moeda(Number(obraResumo.valorPrevisto || 0))}</div>
                    </div>
                  ) : null}
                  {diffPrevistoPlanilha != null && Math.abs(diffPrevistoPlanilha) >= 0.01 ? (
                    <div className="rounded-lg border bg-white px-3 py-2">
                      <div className="text-[11px] uppercase tracking-wide text-slate-500">Diferença (previsto - planilha)</div>
                      <div className="text-sm font-semibold text-red-700">{moeda(Number(diffPrevistoPlanilha || 0))}</div>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            className="rounded-lg border bg-white px-4 py-2 text-sm hover:bg-slate-50 disabled:opacity-60"
            type="button"
            onClick={() => router.push(`/dashboard/engenharia/obras/${idObra}/planilha?returnTo=${encodeURIComponent(safeReturnTo || "")}`)}
            disabled={loading}
          >
            Planilha
          </button>
          <button
            className="rounded-lg border bg-white px-4 py-2 text-sm hover:bg-slate-50 disabled:opacity-60"
            type="button"
            onClick={() =>
              router.push(
                `/dashboard/engenharia/obras/${idObra}/planilha/composicoes?returnTo=${encodeURIComponent(
                  safeReturnTo || `/dashboard/engenharia/obras/${idObra}`
                )}`
              )
            }
            disabled={loading}
          >
            Composições
          </button>
          <button
            className="rounded-lg border bg-white px-4 py-2 text-sm hover:bg-slate-50 disabled:opacity-60"
            type="button"
            onClick={() =>
              router.push(
                `/dashboard/engenharia/obras/${idObra}/planilha/sinapi?returnTo=${encodeURIComponent(
                  safeReturnTo || `/dashboard/engenharia/obras/${idObra}/planilha`
                )}`
              )
            }
            disabled={loading}
            title="Importar composições do SINAPI (Excel)"
          >
            SINAPI
          </button>
          <button
            className="rounded-lg border bg-white px-4 py-2 text-sm hover:bg-slate-50 disabled:opacity-60"
            type="button"
            onClick={() =>
              router.push(
                `/dashboard/engenharia/obras/${idObra}/planilha/insumos?returnTo=${encodeURIComponent(safeReturnTo || `/dashboard/engenharia/obras/${idObra}`)}`
              )
            }
            disabled={loading}
          >
            Insumos
          </button>
          <button
            className="rounded-lg border bg-white px-4 py-2 text-sm hover:bg-slate-50 disabled:opacity-60"
            type="button"
            onClick={() => router.push(safeReturnTo || `/dashboard/engenharia/obras/${idObra}`)}
            disabled={loading}
          >
            Voltar
          </button>
        </div>
      </div>

      {okMsg ? <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">{okMsg}</div> : null}
      {err ? <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div> : null}

      {importPreview.file ? (
        <section className="rounded-xl border bg-white p-4 shadow-sm space-y-3">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <div className="text-lg font-semibold">Prévia da importação (CSV)</div>
              <div className="text-sm text-slate-600">
                Arquivo: <span className="font-medium">{importPreview.file.name}</span> • Nova versão: <span className="font-medium">{importPreview.nomeVersao}</span>
              </div>
              <div className="mt-1 text-sm text-slate-700">
                Total consolidado (serviços): <span className="font-semibold">{moeda(Number(valorTotalPreview || 0))}</span>
              </div>
              {importPreview.missingColumns.length ? (
                <div className="mt-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  Colunas obrigatórias ausentes: {importPreview.missingColumns.join(", ")}
                </div>
              ) : (
                <div className="mt-2 text-xs text-slate-500">Campos importados: item, codigo, fonte, servicos, und, quant, valor_unitario. Valor parcial é calculado automaticamente.</div>
              )}
            </div>
            <div className="flex gap-2">
              <button
                className="rounded-lg border bg-white px-3 py-2 text-sm hover:bg-slate-50"
                type="button"
                onClick={() => setImportPreview({ file: null, nomeVersao: "", rows: [], missingColumns: [] })}
                disabled={loading}
              >
                Cancelar
              </button>
              <button
                className="rounded-lg bg-blue-600 px-3 py-2 text-sm text-white hover:bg-blue-500 disabled:opacity-60"
                type="button"
                onClick={async () => {
                  if (!importPreview.file) return;
                  await importarCsv(importPreview.file, importPreview.nomeVersao);
                  setImportPreview({ file: null, nomeVersao: "", rows: [], missingColumns: [] });
                }}
                disabled={loading || importHasBlockingErrors || !podeEditar}
                title={importHasBlockingErrors ? "Corrija os campos destacados antes de importar" : "Confirmar importação"}
              >
                Confirmar importação
              </button>
            </div>
          </div>

          <div className="overflow-auto rounded-lg border">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-slate-700">
                <tr>
                  <th className="px-3 py-2">Linha</th>
                  <th className="px-3 py-2">Item</th>
                  <th className="px-3 py-2">Código</th>
                  <th className="px-3 py-2">Fonte</th>
                  <th className="px-3 py-2">Serviços</th>
                  <th className="px-3 py-2">Und</th>
                  <th className="px-3 py-2 text-right">Quant</th>
                  <th className="px-3 py-2 text-right">Valor unitário</th>
                  <th className="px-3 py-2 text-right">Valor parcial (calc.)</th>
                </tr>
              </thead>
              <tbody>
                {importPreview.rows.slice(0, 2000).map((r) => {
                  const cellClass = (key: keyof typeof r.errors) => (r.errors?.[key] ? "bg-red-50 text-red-700" : "");
                  return (
                    <tr key={r.rowIndex} className="border-t">
                      <td className="px-3 py-2 text-xs text-slate-500">{r.rowIndex + 2}</td>
                      <td className={`px-3 py-2 ${cellClass("item")}`}>{r.item || "—"}</td>
                      <td className={`px-3 py-2 ${cellClass("codigo")}`}>{r.codigo || "—"}</td>
                      <td className={`px-3 py-2 ${cellClass("fonte")}`}>{r.fonte || "—"}</td>
                      <td className={`px-3 py-2 ${cellClass("servicos")}`}>{r.servicos || "—"}</td>
                      <td className={`px-3 py-2 ${cellClass("und")}`}>{r.und || "—"}</td>
                      <td className={`px-3 py-2 text-right ${cellClass("quant")}`}>{r.quant || "—"}</td>
                      <td className={`px-3 py-2 text-right ${cellClass("valorUnitario")}`}>{r.valorUnitario || "—"}</td>
                      <td className="px-3 py-2 text-right">{r.valorParcialCalc == null ? "—" : moeda(Number(r.valorParcialCalc || 0))}</td>
                    </tr>
                  );
                })}
                {importPreview.rows.length > 2000 ? (
                  <tr className="border-t">
                    <td colSpan={9} className="px-3 py-3 text-xs text-slate-500">
                      Mostrando as primeiras 2000 linhas para prévia. Total no arquivo: {importPreview.rows.length}.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <section className="rounded-xl border bg-white p-4 shadow-sm space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="text-lg font-semibold">Versões cadastradas</div>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              className="rounded-lg border bg-white px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-60"
              type="button"
              onClick={() => {
                carregarVersoes();
                carregarComposicaoStatus();
                carregarComposicaoValidacao(planilhaId);
              }}
              disabled={loading}
            >
              Atualizar
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => {
                const f = (e.target.files || [])[0] || null;
                if (f) prepararImportacaoCsv(f);
              }}
            />
            <button
              className="rounded-lg border bg-white px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-60"
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={loading || !podeEditar}
              title="Importar CSV"
            >
              Importar CSV
            </button>
            <button
              className="rounded-lg border bg-white px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-60 inline-flex items-center gap-2"
              type="button"
              onClick={baixarModeloCsv}
              disabled={loading}
            >
              <Download className="h-4 w-4" />
              Modelo CSV
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
                <th className="px-3 py-2">Origem</th>
                <th className="px-3 py-2 text-right">Serviços</th>
                <th className="px-3 py-2 text-right">Valor total</th>
                <th className="px-3 py-2">Atual</th>
                <th className="px-3 py-2">Criada em</th>
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
                  <td className="px-3 py-2">{v.origem}</td>
                  <td className="px-3 py-2 text-right">{v.totalServicos}</td>
                  <td className="px-3 py-2 text-right">{moeda(Number(v.valorTotal || 0))}</td>
                  <td className="px-3 py-2">
                    {v.atual ? (
                      <span className="inline-flex items-center gap-2 text-green-700">
                        <Check className="h-4 w-4" />
                        Atual
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-3 py-2">{v.criadoEm ? new Date(v.criadoEm).toLocaleString("pt-BR") : "-"}</td>
                </tr>
              ))}
              {!versoes.length ? (
                <tr>
                  <td colSpan={7} className="px-3 py-6 text-center text-slate-500">
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
                <div className="text-sm text-slate-600">Somente a versão atual pode ser editada, e apenas quando a obra estiver "Não iniciada".</div>
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
                  <div className="text-lg font-semibold">Parâmetros (Obra pública)</div>
                </div>
                {showParamsCard ? (
                  <button className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white disabled:opacity-60" type="button" onClick={salvarParametros} disabled={loading || !podeEditar}>
                    Salvar parâmetros
                  </button>
                ) : null}
              </div>
              {showParamsCard ? (
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
                        <td className="px-3 py-2">
                          <input
                            className={`input bg-white ${paramErrors.ufSinapi ? "border-red-300 bg-red-50" : ""}`}
                            value={parametros.ufSinapi}
                            onChange={(e) => {
                              const v = e.target.value;
                              setParametros((p) => ({ ...p, ufSinapi: v }));
                              setParamErrors((p) => {
                                if (!("ufSinapi" in p)) return p;
                                const { ufSinapi: _, ...rest } = p as any;
                                return rest;
                              });
                            }}
                            disabled={!podeEditar}
                            list="planilha-ufs"
                            placeholder="SP"
                          />
                          <datalist id="planilha-ufs">
                            {ufs.map((x) => (
                              <option key={x} value={x} />
                            ))}
                          </datalist>
                        </td>
                      </tr>
                      {[
                        ["Data-base", "dataBaseSbc", "dataBaseSinapi"],
                        ["BDI de Serviços (%)", "bdiServicosSbc", "bdiServicosSinapi"],
                        ["BDI Diferenciado (%)", "bdiDiferenciadoSbc", "bdiDiferenciadoSinapi"],
                        ["Enc. Sociais SEM Desoneração (%)", "encSociaisSemDesSbc", "encSociaisSemDesSinapi"],
                        ["Desconto (%)", "descontoSbc", "descontoSinapi"],
                      ].map(([label, a, b]) => (
                        <tr key={label} className="border-t">
                          <td className="px-3 py-2">{label}</td>
                          <td className="px-3 py-2">
                            <input
                              className={`input bg-white ${paramErrors[a as keyof typeof parametros] ? "border-red-300 bg-red-50" : ""}`}
                              value={(parametros as any)[a]}
                              onChange={(e) => {
                                const v = e.target.value;
                                setParametros((p) => ({ ...p, [a]: v } as any));
                                setParamErrors((p) => {
                                  if (!(a in p)) return p;
                                  const { [a]: _, ...rest } = p as any;
                                  return rest;
                                });
                              }}
                              disabled={!podeEditar}
                            />
                          </td>
                          <td className="px-3 py-2">
                            <input
                              className={`input bg-white ${paramErrors[b as keyof typeof parametros] ? "border-red-300 bg-red-50" : ""}`}
                              value={(parametros as any)[b]}
                              onChange={(e) => {
                                const v = e.target.value;
                                setParametros((p) => ({ ...p, [b]: v } as any));
                                setParamErrors((p) => {
                                  if (!(b in p)) return p;
                                  const { [b]: _, ...rest } = p as any;
                                  return rest;
                                });
                              }}
                              disabled={!podeEditar}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </section>
          </div>

          <div ref={planilhaSectionRef}>
            <section className="rounded-xl border bg-white p-4 shadow-sm space-y-3">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2">
                  <button className="rounded border bg-white px-2 py-1 text-sm hover:bg-slate-50" type="button" onClick={() => setShowPlanilhaCard((v) => !v)}>
                    {showPlanilhaCard ? "⯆" : "⯈"}
                  </button>
                  <div className="text-lg font-semibold">Planilha orçamentária</div>
                </div>
                <div className="flex items-center gap-3 flex-wrap">
                  <div className="flex items-center gap-3 flex-wrap text-sm text-slate-600">
                    <div>{linhasVisiveis.length} linha(s)</div>
                    <div>
                      Valor total: <span className="font-semibold text-slate-900">{moeda(Number(valorTotalPlanilha || 0))}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      className="rounded-lg border bg-white px-3 py-2 text-sm hover:bg-slate-50 inline-flex items-center gap-2 disabled:opacity-60"
                      type="button"
                      onClick={imprimirPlanilha}
                      disabled={loading || !planilha}
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
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-10">
                <div className="md:col-span-2">
                  <div className="text-sm text-slate-600">Tipo</div>
                  <select
                    className={`input bg-white ${linhaErrors.tipoLinha ? "border-red-300 bg-red-50" : ""}`}
                    value={novo.tipoLinha}
                    onChange={(e) => {
                      const tipoLinha = e.target.value as any;
                      setNovo((p) => applyValorParcialAuto({ ...p, tipoLinha }));
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
                  <div className="text-sm text-slate-600">Ordem</div>
                  <input className="input bg-white" value={novo.ordem} onChange={(e) => setNovo((p) => ({ ...p, ordem: e.target.value }))} disabled={!podeEditar} />
                </div>
                <div>
                  <div className="text-sm text-slate-600">ITEM</div>
                  <input
                    className={`input bg-white ${linhaErrors.item ? "border-red-300 bg-red-50" : ""}`}
                    value={novo.item}
                    onChange={(e) => {
                      const v = e.target.value;
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
                  <input
                    className={`input bg-white ${linhaErrors.codigo ? "border-red-300 bg-red-50" : ""}`}
                    value={novo.codigo}
                    onChange={(e) => {
                      const v = e.target.value;
                      setNovo((p) => ({ ...p, codigo: v }));
                      setLinhaErrors((p) => {
                        if (!("codigo" in p)) return p;
                        const { codigo: _, ...rest } = p as any;
                        return rest;
                      });
                    }}
                    disabled={!podeEditar}
                    placeholder="SER-0001"
                  />
                </div>
                <div>
                  <div className="text-sm text-slate-600">FONTE</div>
                  <input className="input bg-white" value={novo.fonte} onChange={(e) => setNovo((p) => ({ ...p, fonte: e.target.value }))} disabled={!podeEditar} placeholder="SINAPI" />
                </div>
                <div className="md:col-span-2">
                  <div className="text-sm text-slate-600">SERVIÇOS</div>
                  <input
                    className={`input bg-white ${linhaErrors.servicos ? "border-red-300 bg-red-50" : ""}`}
                    value={novo.servicos}
                    onChange={(e) => {
                      const v = e.target.value;
                      setNovo((p) => ({ ...p, servicos: v }));
                      setLinhaErrors((p) => {
                        if (!("servicos" in p)) return p;
                        const { servicos: _, ...rest } = p as any;
                        return rest;
                      });
                    }}
                    disabled={!podeEditar}
                  />
                </div>
                <div>
                  <div className="text-sm text-slate-600">UND</div>
                  <input
                    className={`input bg-white ${linhaErrors.und ? "border-red-300 bg-red-50" : ""}`}
                    value={novo.und}
                    onChange={(e) => {
                      const v = e.target.value;
                      setNovo((p) => ({ ...p, und: v }));
                      setLinhaErrors((p) => {
                        if (!("und" in p)) return p;
                        const { und: _, ...rest } = p as any;
                        return rest;
                      });
                    }}
                    disabled={!podeEditar}
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
                  <input
                    className={`input bg-white ${linhaErrors.valorUnitario ? "border-red-300 bg-red-50" : ""}`}
                    value={novo.valorUnitario}
                    onChange={(e) => {
                      const v = e.target.value;
                      setNovo((p) => applyValorParcialAuto({ ...p, valorUnitario: v }));
                      setLinhaErrors((p) => {
                        if (!("valorUnitario" in p) && !("valorParcial" in p)) return p;
                        const { valorUnitario: _vu, valorParcial: _vp, ...rest } = p as any;
                        return rest;
                      });
                    }}
                    onBlur={() => setNovo((p) => applyValorParcialAuto({ ...p }))}
                    disabled={!podeEditar}
                  />
                </div>
              </div>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-6">
                <div className="md:col-span-2">
                  <div className="text-sm text-slate-600">VALOR PARCIAL</div>
                  <input
                    className={`input bg-white ${linhaErrors.valorParcial ? "border-red-300 bg-red-50" : ""}`}
                    value={novo.valorParcial}
                    readOnly={novo.tipoLinha === "SERVICO"}
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
                          setEditingLinhaId(null);
                          setNovo({ tipoLinha: "SERVICO", ordem: "", item: "", codigo: "", fonte: "", servicos: "", und: "", quant: "", valorUnitario: "", valorParcial: "" });
                          setLinhaErrors({});
                          setOkMsg(null);
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
                        router.push(
                          `/dashboard/engenharia/obras/${idObra}/planilha/servicos/${encodeURIComponent(code)}?returnTo=${encodeURIComponent(`/dashboard/engenharia/obras/${idObra}/planilha`)}`
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
                              const sum = k ? subtotalByItemKey.get(k) : null;
                              return typeof sum === "number" && Number.isFinite(sum) && sum > 0 ? moeda(Number(sum)) : "";
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
