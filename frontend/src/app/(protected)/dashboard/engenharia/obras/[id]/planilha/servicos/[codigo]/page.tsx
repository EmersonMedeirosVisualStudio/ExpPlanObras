 "use client";
 
import { useEffect, useMemo, useRef, useState } from "react";
 import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Trash2, Printer, FileSpreadsheet, Image, CheckCircle2, CircleDashed, XCircle, Layers, BrickWall, Wrench, HardHat } from "lucide-react";
 
 type ItemRow = {
  idItemBase: number;
   etapa: string;
   tipoItem: string;
   codigoItem: string;
  banco: string;
   descricao: string;
   und: string;
   quantidade: string;
  valorUnitario: string;
   perdaPercentual: string;
   codigoCentroCusto: string;
  codigoCentroCustoBase: string;
 };
 
type PrevistoPlanilhaRow = {
  item: string;
  fonte: string;
  servicos: string;
  und: string;
  quant: string;
  valorUnitario: string;
  valorParcial: string;
};

type PlanilhaParams = {
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

type EmpresaDocumentosLayout = {
  logoDataUrl: string | null;
  cabecalhoHtml: string | null;
  rodapeHtml: string | null;
  cabecalhoAlturaMm: number | null;
  rodapeAlturaMm: number | null;
  atualizadoEm: string | null;
};

 function toNum(v: string) {
   return parseNumberLoose(v);
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

function moeda(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
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

function isComposicaoTipo(tipo: unknown) {
  const t = normalizeHeader(String(tipo || ""));
  return t === "composicao" || t === "composicao_auxiliar";
}

function formatDateTimePtBR(input: unknown) {
  const d = input instanceof Date ? input : new Date(String(input || ""));
  if (!Number.isFinite(d.getTime())) return "";
  return d.toLocaleString("pt-BR");
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
  const sep = tab >= comma && tab >= semi ? "\t" : semi >= comma ? ";" : ",";

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
          } else inQuotes = false;
        } else cur += ch;
      } else {
        if (ch === '"') inQuotes = true;
        else if (ch === sep) {
          out.push(cur);
          cur = "";
        } else cur += ch;
      }
    }
    out.push(cur);
    return out.map((s) => s.trim());
  };

  const headers = split(lines[0]);
  const rows = lines.slice(1).map(split);
  return { headers, rows };
}

async function readTextSmart(file: File) {
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  const utf8 = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  const win1252 = new TextDecoder("windows-1252", { fatal: false }).decode(bytes);
  const score = (t: string) => (t.match(/\uFFFD/g) || []).length * 10 + (t.match(/[ÃÂ]/g) || []).length;
  return score(utf8) <= score(win1252) ? utf8 : win1252;
}

 export default function Page() {
   const router = useRouter();
   const params = useParams();
   const search = useSearchParams();
 
   const idObra = useMemo(() => Number((params as any)?.id || 0), [params]);
   const codigoServico = useMemo(() => decodeURIComponent(String((params as any)?.codigo || "")).trim().toUpperCase(), [params]);
   const returnTo = search.get("returnTo");
  const planilhaIdParam = search.get("planilhaId");
  const planilhaId = useMemo(() => {
    const n = Number(planilhaIdParam || 0);
    return Number.isFinite(n) && n > 0 ? n : null;
  }, [planilhaIdParam]);
  const trailParam = search.get("trail");
  const trailCodes = useMemo(() => {
    const raw = String(trailParam || "").trim();
    if (!raw) return [];
    const parts = raw
      .split(",")
      .map((s) => String(s || "").trim().toUpperCase())
      .filter(Boolean);
    const out: string[] = [];
    for (const p of parts) {
      if (!p) continue;
      if (p === codigoServico) continue;
      if (out.includes(p)) continue;
      out.push(p);
    }
    return out;
  }, [trailParam, codigoServico]);
  const analysisTitle = useMemo(() => codigoServico || "—", [codigoServico]);
  const [returnToMem, setReturnToMem] = useState<string | null>(null);
 
   const [loading, setLoading] = useState(false);
  const [bootLoading, setBootLoading] = useState(false);
  const [bootDone, setBootDone] = useState(false);
   const [err, setErr] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
   const [itens, setItens] = useState<ItemRow[]>([]);
  const itensSavedRef = useRef<ItemRow[]>([]);
  const [previstoRows, setPrevistoRows] = useState<PrevistoPlanilhaRow[]>([]);
  const [previstoServicoMeta, setPrevistoServicoMeta] = useState<{ descricao: string; und: string; fonte: string } | null>(null);
  const [previstoAlert, setPrevistoAlert] = useState<string | null>(null);
  const [navPlanilhaServicos, setNavPlanilhaServicos] = useState<Array<{ item: string; codigo: string; servicos: string }>>([]);
  const [navIdx, setNavIdx] = useState<number>(-1);
  const [planilhaParams, setPlanilhaParams] = useState<PlanilhaParams | null>(null);
  const [obraNome, setObraNome] = useState<string>("");
  const [planilhaCtx, setPlanilhaCtx] = useState<{
    idFonteDados: number | null;
    fonteNome: string;
    idParametros: number | null;
    parametrosNome: string;
  } | null>(null);
  const [planilhaInfo, setPlanilhaInfo] = useState<{
    idPlanilha: number;
    numeroVersao: number;
    nome: string;
    dataBaseSinapi: string | null;
    ufSinapi: string | null;
  } | null>(null);
  const [definedComposicoesCodes, setDefinedComposicoesCodes] = useState<Set<string>>(new Set());
  const [empresaDocumentosLayout, setEmpresaDocumentosLayout] = useState<EmpresaDocumentosLayout | null>(null);
  const [bancosCustom, setBancosCustom] = useState<string[]>([]);
  const [showDisplayConfig, setShowDisplayConfig] = useState(false);
  const [showPrintConfig, setShowPrintConfig] = useState(false);
  const [itensView, setItensView] = useState<{
    composicoes: boolean;
    materiais: boolean;
    equipamentos: boolean;
    servicos: boolean;
    especiais: boolean;
  }>({ composicoes: true, materiais: true, equipamentos: true, servicos: true, especiais: true });
  const [displayPrefs, setDisplayPrefs] = useState<{
    colTipo: boolean;
    colCodigo: boolean;
    colBanco: boolean;
    colDescricao: boolean;
    colUnd: boolean;
    colQtd: boolean;
    colValorUnit: boolean;
    colTotal: boolean;
    colCentroCusto: boolean;
    bgComposicoes: string;
    bgMateriais: string;
    bgEquipamentos: string;
    bgMao: string;
    wTipoPx: number;
    wCodigoPx: number;
    wBancoPx: number;
    wDescricaoPx: number;
    wUndPx: number;
    wQtdPx: number;
    wValorUnitPx: number;
    wTotalPx: number;
    wCentroCustoPx: number;
    wAcoesPx: number;
    fsTipoPx: number;
    fsCodigoPx: number;
    fsBancoPx: number;
    fsDescricaoPx: number;
    fsUndPx: number;
    fsQtdPx: number;
    fsValorUnitPx: number;
    fsTotalPx: number;
    fsCentroCustoPx: number;
    fsAcoesPx: number;
  }>({
    colTipo: true,
    colCodigo: true,
    colBanco: true,
    colDescricao: true,
    colUnd: true,
    colQtd: true,
    colValorUnit: true,
    colTotal: true,
    colCentroCusto: true,
    bgComposicoes: "#F8FAFC",
    bgMateriais: "#FFFFFF",
    bgEquipamentos: "#FFFFFF",
    bgMao: "#FFFFFF",
    wTipoPx: 72,
    wCodigoPx: 90,
    wBancoPx: 130,
    wDescricaoPx: 520,
    wUndPx: 52,
    wQtdPx: 88,
    wValorUnitPx: 92,
    wTotalPx: 120,
    wCentroCustoPx: 110,
    wAcoesPx: 72,
    fsTipoPx: 13,
    fsCodigoPx: 13,
    fsBancoPx: 13,
    fsDescricaoPx: 13,
    fsUndPx: 13,
    fsQtdPx: 13,
    fsValorUnitPx: 13,
    fsTotalPx: 13,
    fsCentroCustoPx: 13,
    fsAcoesPx: 13,
  });
  const [servicoDisplayPrefs, setServicoDisplayPrefs] = useState<{
    colFonte: boolean;
    colUnd: boolean;
    colValorUnit: boolean;
    colTotalSemBDI: boolean;
    colTotalSemBDIComDesconto: boolean;
    wCodigoPx: number;
    wFontePx: number;
    wServicoPx: number;
    wUndPx: number;
    wValorUnitPx: number;
    wTotalSemBDIPx: number;
    wTotalSemBDIComDescontoPx: number;
    fsPx: number;
  }>({
    colFonte: true,
    colUnd: true,
    colValorUnit: true,
    colTotalSemBDI: true,
    colTotalSemBDIComDesconto: true,
    wCodigoPx: 110,
    wFontePx: 160,
    wServicoPx: 520,
    wUndPx: 80,
    wValorUnitPx: 140,
    wTotalSemBDIPx: 160,
    wTotalSemBDIComDescontoPx: 220,
    fsPx: 13,
  });
  const [printPrefs, setPrintPrefs] = useState<{
    headerFontFamily: string;
    headerFontSizePx: number;
    headerFontWeight: "normal" | "semibold" | "bold";
    topToHeaderPx: number;
    includeEmpresaHeader: boolean;
  }>({ headerFontFamily: "Arial", headerFontSizePx: 11, headerFontWeight: "semibold", topToHeaderPx: 0, includeEmpresaHeader: true });

  const [primitiveOpen, setPrimitiveOpen] = useState(false);
  const [primitiveLoading, setPrimitiveLoading] = useState(false);
  const [primitiveErr, setPrimitiveErr] = useState<string | null>(null);
  const [primitiveMeta, setPrimitiveMeta] = useState<{ descricaoServico: string | null; undServico: string | null; updatedAt: string | null } | null>(null);
  const [primitiveRows, setPrimitiveRows] = useState<
    Array<{ tipoItem: string; codigoItem: string; banco: string; descricao: string; und: string; quantidade: number; valorUnitario: number; total: number }>
  >([]);
  const [importPreview, setImportPreview] = useState<{
    file: File | null;
    rows: Array<{
      rowIndex: number;
      etapa: string;
      tipoItem: string;
      codigoItem: string;
      banco: string;
      descricao: string;
      und: string;
      quantidade: string;
      valorUnitario: string;
      perdaPercentual: string;
      codigoCentroCusto: string;
      errors: Partial<Record<"tipoItem" | "codigoItem" | "descricao" | "und" | "quantidade", string>>;
    }>;
  }>({ file: null, rows: [] });
  const [importChoiceOpen, setImportChoiceOpen] = useState(false);
  const [importChoiceInfo, setImportChoiceInfo] = useState<{ existingCount: number; incomingCount: number } | null>(null);
 
   const fileInputRef = useRef<HTMLInputElement | null>(null);
  const compTotalCacheRef = useRef<Map<string, number>>(new Map());

  function getUserKeyBase() {
    try {
      const raw = localStorage.getItem("user");
      const u = raw ? JSON.parse(raw) : null;
      const id = Number(u?.id);
      if (Number.isFinite(id) && id > 0) return `exp:composicao:servico:${id}`;
    } catch {}
    return "exp:composicao:servico";
  }

  function getDisplayPrefsKey() {
    return `${getUserKeyBase()}:display`;
  }

  function getServicoDisplayPrefsKey() {
    return `${getUserKeyBase()}:display:servico`;
  }

  function getPrintPrefsKey() {
    return `${getUserKeyBase()}:print`;
  }

  function getReturnToKey() {
    return `${getUserKeyBase()}:returnTo:${idObra || 0}`;
  }
 
   async function authFetch(input: RequestInfo | URL, init?: RequestInit) {
     let token: string | null = null;
     try {
       token = localStorage.getItem("token");
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
 
  async function carregar(silent?: boolean) {
     if (!idObra || !codigoServico) return;
     try {
       setLoading(true);
       setErr(null);
      if (!silent) setOkMsg(null);
      const qs = planilhaId ? `?planilhaId=${encodeURIComponent(String(planilhaId))}` : "";
      const res = await authFetch(`/api/v1/engenharia/obras/${idObra}/planilha/servicos/${encodeURIComponent(codigoServico)}/composicao-itens${qs}`);
       const json = await res.json().catch(() => null);
       if (!res.ok || !json?.success) throw new Error(json?.message || "Erro ao carregar composição");
       const list = Array.isArray(json.data?.itens) ? json.data.itens : [];
      const mapped = list.map((i: any) => ({
        idItemBase: Number(i.idItemBase || 0),
        etapa: String(i.etapa || ""),
        tipoItem: String(i.tipoItem || "INSUMO"),
        codigoItem: String(i.codigoItem || ""),
        banco: String(i.banco || ""),
        descricao: String(i.descricao || ""),
        und: String(i.und || ""),
        quantidade: i.quantidade == null ? "" : String(i.quantidade),
        valorUnitario: i.valorUnitario == null ? "" : String(i.valorUnitario),
        perdaPercentual: i.perdaPercentual == null ? "" : String(i.perdaPercentual),
        codigoCentroCusto: String(i.codigoCentroCusto || ""),
        codigoCentroCustoBase: String(i.codigoCentroCustoBase || ""),
      }));
      setItens(mapped);
      itensSavedRef.current = mapped.map((r: any) => ({ ...r }));
      if (!silent) setOkMsg("Composição carregada.");
     } catch (e: any) {
      const msg = e?.message || "Erro ao carregar composição";
      if (String(msg).startsWith("Serviço não existe na planilha:") || String(msg).startsWith("Serviço na planilha está sem nome")) {
        setErr(null);
      } else {
        setErr(msg);
      }
       setItens([]);
      itensSavedRef.current = [];
     } finally {
       setLoading(false);
     }
   }
 
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      const saved = itensSavedRef.current || [];
      const cur = itens || [];
      const changed =
        cur.length !== saved.length ||
        cur.some((r, i) => {
          const s = saved[i];
          if (!s) return true;
          return (
            String(r.tipoItem || "") !== String(s.tipoItem || "") ||
            String(r.codigoItem || "") !== String(s.codigoItem || "") ||
            String(r.quantidade || "") !== String(s.quantidade || "") ||
            String(r.valorUnitario || "") !== String(s.valorUnitario || "") ||
            String(r.banco || "") !== String(s.banco || "") ||
            String(r.descricao || "") !== String(s.descricao || "") ||
            String(r.und || "") !== String(s.und || "") ||
            String(r.perdaPercentual || "") !== String(s.perdaPercentual || "") ||
            String(r.codigoCentroCusto || "") !== String(s.codigoCentroCusto || "")
          );
        });
      if (!changed) return;
      e.preventDefault();
      setErr(null);
      setOkMsg("Edição cancelada.");
      setItens(saved.map((r: any) => ({ ...r })));
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [itens]);

   async function salvar() {
     if (!idObra || !codigoServico) return;
     try {
       setLoading(true);
       setErr(null);
      setOkMsg(null);
      const pid = planilhaInfo?.idPlanilha || planilhaId;
      if (!pid) throw new Error("Selecione uma planilha para salvar a composição.");

      const servicoPayload = {
        descricao: String(previstoServicoMeta?.descricao || "").trim(),
        und: String(previstoServicoMeta?.und || "").trim(),
        banco: String(previstoServicoMeta?.fonte || "").trim(),
      };

      if (!servicoPayload.descricao || !servicoPayload.und) {
        throw new Error("Para salvar a composição, você deve preencher o Nome (Descrição) e a Unidade (UND) do serviço no painel 'Serviço'.");
      }

       const payload = itens
         .map((i) => ({
           etapa: i.etapa,
           tipoItem: i.tipoItem,
           codigoItem: i.codigoItem,
          banco: i.banco,
           descricao: i.descricao,
           und: i.und,
           quantidade: i.quantidade,
          valorUnitario: i.valorUnitario,
           perdaPercentual: i.perdaPercentual,
           codigoCentroCusto: i.codigoCentroCusto,
         }))
         .filter((i) => i.codigoItem.trim() && toNum(i.quantidade) != null);
 
      const qs = pid ? `?planilhaId=${encodeURIComponent(String(pid))}` : "";
      const res = await authFetch(`/api/v1/engenharia/obras/${idObra}/planilha/servicos/${encodeURIComponent(codigoServico)}/composicao-itens${qs}`, {
         method: "PUT",
         headers: { "Content-Type": "application/json" },
         body: JSON.stringify({ itens: payload, servico: servicoPayload }),
       });
       const json = await res.json().catch(() => null);
       if (!res.ok || !json?.success) throw new Error(json?.message || "Erro ao salvar composição");
       await carregar();
      setOkMsg("Composição salva com sucesso.");
     } catch (e: any) {
       setErr(e?.message || "Erro ao salvar composição");
     } finally {
       setLoading(false);
     }
   }
 
  async function salvarItens(payload: Array<any>, successMsg: string) {
     try {
       setLoading(true);
       setErr(null);
      setOkMsg(null);

      const servicoPayload = {
        descricao: String(previstoServicoMeta?.descricao || "").trim(),
        und: String(previstoServicoMeta?.und || "").trim(),
        banco: String(previstoServicoMeta?.fonte || "").trim(),
      };

      if (!servicoPayload.descricao || !servicoPayload.und) {
        throw new Error("Para importar a composição, você deve preencher o Nome (Descrição) e a Unidade (UND) do serviço no painel 'Serviço'.");
      }

      const qs = planilhaId ? `?planilhaId=${encodeURIComponent(String(planilhaId))}` : "";
      const res = await authFetch(`/api/v1/engenharia/obras/${idObra}/planilha/servicos/${encodeURIComponent(codigoServico)}/composicao-itens${qs}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itens: payload, servico: servicoPayload }),
      });
       const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.message || "Erro ao salvar composição");
      await carregar(true);
      setOkMsg(successMsg);
     } catch (e: any) {
      setErr(e?.message || "Erro ao salvar composição");
     } finally {
       setLoading(false);
     }
   }

  function mergeImport(existing: ItemRow[], incoming: ItemRow[]) {
    const keyOf = (i: ItemRow) =>
      [
        String(i.etapa || "").trim().toUpperCase(),
        String(i.tipoItem || "").trim().toUpperCase(),
        String(i.codigoItem || "").trim().toUpperCase(),
        String(i.banco || "").trim().toUpperCase(),
        String(i.descricao || "").trim().toUpperCase(),
        String(i.und || "").trim().toUpperCase(),
        String(i.codigoCentroCusto || "").trim().toUpperCase(),
      ].join("|");
    const map = new Map<string, ItemRow>();
    for (const e of existing) map.set(keyOf(e), { ...e });
    for (const i of incoming) {
      const k = keyOf(i);
      if (!map.has(k)) {
        map.set(k, { ...i });
        continue;
      }
      const cur = map.get(k)!;
      const qCur = parseNumberLoose(cur.quantidade);
      const qInc = parseNumberLoose(i.quantidade);
      const nextQ = (qCur == null ? 0 : qCur) + (qInc == null ? 0 : qInc);
      const vu = String(i.valorUnitario || "").trim() ? i.valorUnitario : cur.valorUnitario;
      const perda = String(i.perdaPercentual || "").trim() ? i.perdaPercentual : cur.perdaPercentual;
      map.set(k, { ...cur, quantidade: nextQ ? String(nextQ) : cur.quantidade, valorUnitario: vu, perdaPercentual: perda });
    }
    return Array.from(map.values());
  }

  async function prepararImportacaoCsv(file: File) {
    if (!idObra || !codigoServico) return;
    try {
      setErr(null);
      setOkMsg(null);
      const text = await readTextSmart(file);
      const { headers, rows } = parseCsvTextAuto(text);
      if (!headers.length || !rows.length) throw new Error("CSV vazio ou inválido");
      const idx: Record<string, number> = Object.fromEntries(headers.map((h, i) => [normalizeHeader(h), i]));
      const get = (r: string[], key: string) => String(r[idx[key]] ?? "").trim();

      const hasOld = idx["codigo_item"] != null || idx["tipo_item"] != null;
      const hasNew = idx["codigo"] != null || idx["tipo"] != null || idx["servico"] != null;
      if (!hasOld && !hasNew) throw new Error("Cabeçalho do CSV inválido");

      const mapTipo = (raw: string) => {
        const v = String(raw || "").trim().toUpperCase();
        if (!v) return "INSUMO";
        if (v.includes("AUXILIAR")) return "COMPOSICAO_AUXILIAR";
        if (v.includes("COMPOSICAO")) return "COMPOSICAO";
        if (v.includes("INSUMO")) return "INSUMO";
        if (v.includes("MAO")) return "MAO_DE_OBRA";
        if (v.includes("EQUIP")) return "EQUIPAMENTO";
        return "";
      };

      const previewRows: (typeof importPreview.rows) = [];
      const incoming: ItemRow[] = [];

      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        const servicoIn = idx["servico"] != null ? get(r, "servico").toUpperCase() : "";
        if (servicoIn && servicoIn !== codigoServico) continue;
        const etapa = idx["etapa"] != null ? get(r, "etapa") : "";
        const tipoRaw = hasOld ? (idx["tipo_item"] != null ? get(r, "tipo_item") : "INSUMO") : get(r, "tipo");
        const tipoItem = mapTipo(tipoRaw);
        const codigoItem = hasOld ? get(r, "codigo_item") : get(r, "codigo");
        const banco = idx["banco"] != null ? get(r, "banco") : "";
        const descricao = idx["descricao"] != null ? get(r, "descricao") : "";
        const und = idx["und"] != null ? get(r, "und") : "";
        const quantidade = get(r, "quantidade");
        const valorUnitario = idx["valor_unit"] != null ? get(r, "valor_unit") : idx["valor_unitario"] != null ? get(r, "valor_unitario") : "";
        const perdaPercentual = idx["perda_percentual"] != null ? get(r, "perda_percentual") : "";
        const codigoCentroCusto = idx["codigo_centro_custo"] != null ? get(r, "codigo_centro_custo") : "";

        const errors: any = {};
        if (!codigoItem) errors.codigoItem = "Obrigatório";
        if (!tipoItem) errors.tipoItem = "Tipo inválido";
        if (!String(descricao || "").trim()) errors.descricao = "Obrigatório";
        if (!String(und || "").trim()) errors.und = "Obrigatório";
        const q = parseNumberLoose(quantidade);
        if (q == null || !(q > 0)) errors.quantidade = "Inválida";

        previewRows.push({
          rowIndex: i,
          etapa,
          tipoItem: tipoItem || "",
          codigoItem,
          banco,
          descricao,
          und,
          quantidade,
          valorUnitario,
          perdaPercentual,
          codigoCentroCusto,
          errors,
        });

        if (Object.keys(errors).length === 0) {
          incoming.push({
            idItemBase: Date.now() + i,
            etapa,
            tipoItem,
            codigoItem,
            banco,
            descricao,
            und,
            quantidade,
            valorUnitario,
            perdaPercentual,
            codigoCentroCusto,
            codigoCentroCustoBase: "",
          });
        }
      }

      if (!previewRows.length) throw new Error("Nenhuma linha aplicável para este serviço no CSV.");
      setImportPreview({ file, rows: previewRows });
      if (fileInputRef.current) fileInputRef.current.value = "";
      setOkMsg(`Prévia carregada: ${incoming.length} linha(s) válida(s) para importação.`);
    } catch (e: any) {
      setImportPreview({ file: null, rows: [] });
      setErr(e?.message || "Erro ao preparar importação");
    }
  }

  async function confirmarImportacao(mode: "REPLACE" | "MERGE") {
    const file = importPreview.file;
    if (!file) return;
    const valid = importPreview.rows.filter((r) => Object.keys(r.errors || {}).length === 0);
    const incoming: ItemRow[] = valid.map((r, i) => ({
      idItemBase: Date.now() + i,
      etapa: r.etapa,
      tipoItem: r.tipoItem,
      codigoItem: r.codigoItem,
      banco: r.banco,
      descricao: r.descricao,
      und: r.und,
      quantidade: r.quantidade,
      valorUnitario: r.valorUnitario,
      perdaPercentual: r.perdaPercentual,
      codigoCentroCusto: r.codigoCentroCusto,
      codigoCentroCustoBase: "",
    }));
    if (!incoming.length) {
      setErr("Não há linhas válidas para importar. Corrija o CSV.");
      return;
    }

    let base = itens;
    if (!base.length) await carregar(true);
    base = itens;

    const finalList = mode === "MERGE" ? mergeImport(base, incoming) : incoming;
    const payload = finalList
      .map((i) => ({
        etapa: i.etapa,
        tipoItem: i.tipoItem,
        codigoItem: i.codigoItem,
        banco: i.banco,
        descricao: i.descricao,
        und: i.und,
        quantidade: i.quantidade,
        valorUnitario: i.valorUnitario,
        perdaPercentual: i.perdaPercentual,
        codigoCentroCusto: i.codigoCentroCusto,
      }))
      .filter((i) => String(i.codigoItem || "").trim() && toNum(i.quantidade) != null);

    await salvarItens(payload, mode === "MERGE" ? "CSV importado e mesclado com a composição existente." : "CSV importado substituindo a composição existente.");
    setImportPreview({ file: null, rows: [] });
    setImportChoiceOpen(false);
    setImportChoiceInfo(null);
  }

  async function carregarPrevistoPlanilha() {
    if (!idObra || !codigoServico) return;
    try {
      setPrevistoServicoMeta(null);
      setPrevistoAlert(null);
      const resV = await authFetch(`/api/v1/engenharia/obras/${idObra}/planilha?view=versoes-info`);
      const jsonV = await resV.json().catch(() => null);
      if (!resV.ok || !jsonV?.success) throw new Error(jsonV?.message || "Erro ao carregar versões");
      const obra = jsonV?.data?.obra || null;
      setObraNome(String(obra?.nome || obra?.name || "").trim());
      const versoes = Array.isArray(jsonV.data?.versoes) ? jsonV.data.versoes : [];
      const byQuery = planilhaId != null ? versoes.find((v: any) => Number(v?.idPlanilha || 0) === Number(planilhaId)) : null;
      const atual = versoes.find((v: any) => Boolean(v.atual)) || versoes[0] || null;
      const pick = byQuery || atual || null;
      const pid = pick?.idPlanilha != null ? Number(pick.idPlanilha) : 0;
      setPlanilhaCtx(
        pick
          ? {
              idFonteDados: pick.idFonteDados == null ? null : Number(pick.idFonteDados),
              fonteNome: String(pick.fonteNome || ""),
              idParametros: pick.idParametros == null ? null : Number(pick.idParametros),
              parametrosNome: String(pick.parametrosNome || ""),
            }
          : null
      );
      if (!pid) {
        setPrevistoRows([]);
        return;
      }

      const res = await authFetch(`/api/v1/engenharia/obras/${idObra}/planilha?planilhaId=${pid}`);
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.message || "Erro ao carregar planilha");
      const p = (json.data?.planilha?.parametros || {}) as any;
      const plan = json.data?.planilha || null;
      setPlanilhaInfo(
        plan
          ? {
              idPlanilha: Number(plan.idPlanilha || pid),
              numeroVersao: Number(plan.numeroVersao || 0),
              nome: plan?.nome != null ? String(plan.nome || "").trim() : "",
              dataBaseSinapi: p.dataBaseSinapi == null ? null : String(p.dataBaseSinapi || ""),
              ufSinapi: p.ufSinapi == null ? null : String(p.ufSinapi || "").trim().toUpperCase(),
            }
          : null
      );
      setPlanilhaParams({
        dataBaseSbc: p.dataBaseSbc == null ? null : String(p.dataBaseSbc || ""),
        dataBaseSinapi: p.dataBaseSinapi == null ? null : String(p.dataBaseSinapi || ""),
        bdiServicosSbc: p.bdiServicosSbc == null ? null : Number(p.bdiServicosSbc),
        bdiServicosSinapi: p.bdiServicosSinapi == null ? null : Number(p.bdiServicosSinapi),
        bdiDiferenciadoSbc: p.bdiDiferenciadoSbc == null ? null : Number(p.bdiDiferenciadoSbc),
        bdiDiferenciadoSinapi: p.bdiDiferenciadoSinapi == null ? null : Number(p.bdiDiferenciadoSinapi),
        encSociaisSemDesSbc: p.encSociaisSemDesSbc == null ? null : Number(p.encSociaisSemDesSbc),
        encSociaisSemDesSinapi: p.encSociaisSemDesSinapi == null ? null : Number(p.encSociaisSemDesSinapi),
        descontoSbc: p.descontoSbc == null ? null : Number(p.descontoSbc),
        descontoSinapi: p.descontoSinapi == null ? null : Number(p.descontoSinapi),
      });
      const linhas = Array.isArray(json.data?.planilha?.linhas) ? json.data.planilha.linhas : [];
      const navList: Array<{ item: string; codigo: string; servicos: string }> = linhas
        .filter((l: any) => String(l.tipoLinha || "").toUpperCase() === "SERVICO" && String(l.codigo || "").trim())
        .map((l: any) => ({
          item: String(l.item || ""),
          codigo: String(l.codigo || "").trim().toUpperCase(),
          servicos: String(l.servicos || ""),
        }));
      setNavPlanilhaServicos(navList);
      setNavIdx(navList.findIndex((x: { codigo: string }) => x.codigo === codigoServico));
      let rows: PrevistoPlanilhaRow[] = linhas
        .filter((l: any) => String(l.tipoLinha || "").toUpperCase() === "SERVICO" && String(l.codigo || "").trim().toUpperCase() === codigoServico)
        .map((l: any) => ({
          item: String(l.item || ""),
          fonte: String(l.fonte || ""),
          servicos: String(l.servicos || ""),
          und: String(l.und || ""),
          quant: String(l.quant || ""),
          valorUnitario: String(l.valorUnitario || ""),
          valorParcial: String(l.valorParcial || ""),
        }));
      const precisaMeta = !rows.length || !String(rows?.[0]?.servicos || "").trim() || !String(rows?.[0]?.und || "").trim();
      let usedMeta = false;
      let metaDesc = "";
      let metaUnd = "";
      let metaFonte = "";
      if (precisaMeta) {
        try {
          const qs = new URLSearchParams();
          qs.set("planilhaId", String(pid));
          const resMeta = await authFetch(
            `/api/v1/engenharia/obras/${idObra}/planilha/servicos/${encodeURIComponent(codigoServico)}/meta?${qs.toString()}`
          );
          const jsonMeta = await resMeta.json().catch(() => null);
          if (resMeta.ok && jsonMeta?.success) {
            const desc = jsonMeta.data?.descricao != null ? String(jsonMeta.data.descricao || "").trim() : "";
            const und = jsonMeta.data?.und != null ? String(jsonMeta.data.und || "").trim() : "";
            const fonte = jsonMeta.data?.fonte != null ? String(jsonMeta.data.fonte || "").trim().toUpperCase() : "";
            metaDesc = desc;
            metaUnd = und;
            metaFonte = fonte;
            if (desc || und) {
              setPrevistoServicoMeta({ descricao: desc, und, fonte });
              usedMeta = true;
              rows = rows.map((r: PrevistoPlanilhaRow) => ({
                ...r,
                servicos: String(r.servicos || "").trim() ? r.servicos : desc,
                und: String(r.und || "").trim() ? r.und : und,
              }));
            }
          }
        } catch {}
      }
      if (!rows.length) {
        setPrevistoAlert(null);
      } else {
        const nomeFinal = String(rows?.[0]?.servicos || "").trim();
        const undFinal = String(rows?.[0]?.und || "").trim();
        if (!nomeFinal || !undFinal) {
          setPrevistoAlert(
            "Este serviço está cadastrado na planilha sem nome e/ou unidade. Isso pode quebrar importações, clonagens e validações. Corrija na planilha (preencha SERVIÇO e UND)."
          );
        } else if (usedMeta) {
          setPrevistoAlert("Nome e/ou unidade foram preenchidos automaticamente a partir do catálogo da planilha (fallback), porque estavam vazios nas linhas.");
        }
      }
      setPrevistoRows(rows);
    } catch {
      setPrevistoRows([]);
      setPrevistoServicoMeta(null);
      setPrevistoAlert(null);
      setPlanilhaParams(null);
      setPlanilhaInfo(null);
      setObraNome("");
      setPlanilhaCtx(null);
      setNavPlanilhaServicos([]);
      setNavIdx(-1);
    }
  }

  async function carregarComposicoesDefinidas() {
    if (!idObra) return;
    try {
      const qs = planilhaId ? `?planilhaId=${encodeURIComponent(String(planilhaId))}` : "";
      const res = await authFetch(`/api/v1/engenharia/obras/${idObra}/planilha/composicoes/status${qs}`);
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        setDefinedComposicoesCodes(new Set());
        return;
      }
      const codes = Array.isArray(json.data?.codes) ? json.data.codes : [];
      setDefinedComposicoesCodes(new Set(codes.map((c: any) => String(c || "").trim().toUpperCase()).filter(Boolean)));
    } catch {
      setDefinedComposicoesCodes(new Set());
    }
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

  function baixarModeloComposicoesCsv() {
    const sep = "\t";
    const lines = [
      ["Serviço", "tipo", "codigo", "banco", "descricao", "und", "quantidade", "Valor Unit"].join(sep),
      [`${codigoServico || "SER-0001"}`, "Insumo", "INS-0001", "SINAPI", "Cimento CP-II", "kg", "100", "10,50"].join(sep),
      [`${codigoServico || "SER-0001"}`, "Insumo", "INS-0002", "Próprio", "Areia média", "m³", "0,50", "150,00"].join(sep),
    ];
    const csv = `${lines.join("\n")}\n`;
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `composicao_servico_${codigoServico || "modelo"}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function getBancosKey() {
    try {
      const raw = localStorage.getItem("user");
      const u = raw ? JSON.parse(raw) : null;
      const id = Number(u?.id);
      if (Number.isFinite(id) && id > 0) return `exp:composicao:bancos:${id}`;
    } catch {}
    return "exp:composicao:bancos";
  }

  useEffect(() => {
    try {
      const raw = localStorage.getItem(getBancosKey());
      const arr = raw ? (JSON.parse(raw) as any[]) : [];
      const list = Array.isArray(arr) ? arr.map((x) => String(x || "").trim()).filter(Boolean) : [];
      setBancosCustom(Array.from(new Set(list)));
    } catch {
      setBancosCustom([]);
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(getBancosKey(), JSON.stringify(bancosCustom));
    } catch {}
  }, [bancosCustom]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(getDisplayPrefsKey());
      if (!raw) return;
      const p = JSON.parse(raw) as any;
      const n = (v: any, min: number, max: number, fallback: number) => {
        const x = Number(v);
        return Number.isFinite(x) ? Math.max(min, Math.min(max, Math.round(x))) : fallback;
      };
      setDisplayPrefs((cur) => ({
        colTipo: p?.colTipo !== false,
        colCodigo: p?.colCodigo !== false,
        colBanco: p?.colBanco !== false,
        colDescricao: p?.colDescricao !== false,
        colUnd: p?.colUnd !== false,
        colQtd: p?.colQtd !== false,
        colValorUnit: p?.colValorUnit !== false,
        colTotal: p?.colTotal !== false,
        colCentroCusto: p?.colCentroCusto !== false,
        bgComposicoes: typeof p?.bgComposicoes === "string" && String(p.bgComposicoes).startsWith("#") ? String(p.bgComposicoes) : cur.bgComposicoes,
        bgMateriais: typeof p?.bgMateriais === "string" && String(p.bgMateriais).startsWith("#") ? String(p.bgMateriais) : cur.bgMateriais,
        bgEquipamentos: typeof p?.bgEquipamentos === "string" && String(p.bgEquipamentos).startsWith("#") ? String(p.bgEquipamentos) : cur.bgEquipamentos,
        bgMao: typeof p?.bgMao === "string" && String(p.bgMao).startsWith("#") ? String(p.bgMao) : cur.bgMao,
        wTipoPx: n(p?.wTipoPx, 44, 220, cur.wTipoPx),
        wCodigoPx: n(p?.wCodigoPx, 60, 280, cur.wCodigoPx),
        wBancoPx: n(p?.wBancoPx, 90, 280, cur.wBancoPx),
        wDescricaoPx: n(p?.wDescricaoPx, 220, 1200, cur.wDescricaoPx),
        wUndPx: n(p?.wUndPx, 40, 140, cur.wUndPx),
        wQtdPx: n(p?.wQtdPx, 60, 160, cur.wQtdPx),
        wValorUnitPx: n(p?.wValorUnitPx, 60, 200, cur.wValorUnitPx),
        wTotalPx: n(p?.wTotalPx, 80, 220, cur.wTotalPx),
        wCentroCustoPx: n(p?.wCentroCustoPx, 64, 240, cur.wCentroCustoPx),
        wAcoesPx: n(p?.wAcoesPx, 56, 160, cur.wAcoesPx),
        fsTipoPx: n(p?.fsTipoPx, 10, 16, cur.fsTipoPx),
        fsCodigoPx: n(p?.fsCodigoPx, 10, 16, cur.fsCodigoPx),
        fsBancoPx: n(p?.fsBancoPx, 10, 16, cur.fsBancoPx),
        fsDescricaoPx: n(p?.fsDescricaoPx, 10, 16, cur.fsDescricaoPx),
        fsUndPx: n(p?.fsUndPx, 10, 16, cur.fsUndPx),
        fsQtdPx: n(p?.fsQtdPx, 10, 16, cur.fsQtdPx),
        fsValorUnitPx: n(p?.fsValorUnitPx, 10, 16, cur.fsValorUnitPx),
        fsTotalPx: n(p?.fsTotalPx, 10, 16, cur.fsTotalPx),
        fsCentroCustoPx: n(p?.fsCentroCustoPx, 10, 16, cur.fsCentroCustoPx),
        fsAcoesPx: n(p?.fsAcoesPx, 10, 16, cur.fsAcoesPx),
      }));
    } catch {}
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(getDisplayPrefsKey(), JSON.stringify(displayPrefs));
    } catch {}
  }, [displayPrefs]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(getServicoDisplayPrefsKey());
      if (!raw) return;
      const p = JSON.parse(raw) as any;
      const n = (v: any, min: number, max: number, fallback: number) => {
        const x = Number(v);
        return Number.isFinite(x) ? Math.max(min, Math.min(max, Math.round(x))) : fallback;
      };
      setServicoDisplayPrefs((cur) => ({
        colFonte: p?.colFonte !== false,
        colUnd: p?.colUnd !== false,
        colValorUnit: p?.colValorUnit !== false,
        colTotalSemBDI: p?.colTotalSemBDI !== false,
        colTotalSemBDIComDesconto: p?.colTotalSemBDIComDesconto !== false,
        wCodigoPx: n(p?.wCodigoPx, 80, 240, cur.wCodigoPx),
        wFontePx: n(p?.wFontePx, 80, 260, cur.wFontePx),
        wServicoPx: n(p?.wServicoPx, 220, 1200, cur.wServicoPx),
        wUndPx: n(p?.wUndPx, 60, 180, cur.wUndPx),
        wValorUnitPx: n(p?.wValorUnitPx, 90, 240, cur.wValorUnitPx),
        wTotalSemBDIPx: n(p?.wTotalSemBDIPx, 110, 320, cur.wTotalSemBDIPx),
        wTotalSemBDIComDescontoPx: n(p?.wTotalSemBDIComDescontoPx, 140, 420, cur.wTotalSemBDIComDescontoPx),
        fsPx: n(p?.fsPx, 10, 16, cur.fsPx),
      }));
    } catch {}
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(getServicoDisplayPrefsKey(), JSON.stringify(servicoDisplayPrefs));
    } catch {}
  }, [servicoDisplayPrefs]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(getPrintPrefsKey());
      if (!raw) return;
      const p = JSON.parse(raw) as any;
      const ff = typeof p?.headerFontFamily === "string" && String(p.headerFontFamily).trim() ? String(p.headerFontFamily).trim() : "";
      const fs = p?.headerFontSizePx != null ? Number(p.headerFontSizePx) : NaN;
      const fwRaw = String(p?.headerFontWeight || "").trim().toLowerCase();
      const fw = fwRaw === "bold" ? "bold" : fwRaw === "normal" ? "normal" : "semibold";
      const top = p?.topToHeaderPx != null ? Number(p.topToHeaderPx) : NaN;
      const inc = p?.includeEmpresaHeader;
      setPrintPrefs((cur) => ({
        headerFontFamily: ff || cur.headerFontFamily,
        headerFontSizePx: Number.isFinite(fs) ? Math.max(8, Math.min(16, Math.round(fs))) : cur.headerFontSizePx,
        headerFontWeight: fw,
        topToHeaderPx: Number.isFinite(top) ? Math.max(0, Math.min(80, Math.round(top))) : cur.topToHeaderPx,
        includeEmpresaHeader: typeof inc === "boolean" ? inc : cur.includeEmpresaHeader,
      }));
    } catch {}
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(getPrintPrefsKey(), JSON.stringify(printPrefs));
    } catch {}
  }, [printPrefs]);

  useEffect(() => {
    if (!idObra || !codigoServico) return;
    let cancelled = false;
    setBootLoading(true);
    setBootDone(false);
    void (async () => {
      try {
        await Promise.all([carregar(true), carregarPrevistoPlanilha(), carregarComposicoesDefinidas(), carregarEmpresaDocumentosLayout()]);
      } finally {
        if (!cancelled) {
          setBootLoading(false);
          setBootDone(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [idObra, codigoServico]);

  useEffect(() => {
    try {
      const key = getReturnToKey();
      const rt = String(returnTo || "").trim();
      if (rt) {
        sessionStorage.setItem(key, rt);
        setReturnToMem(rt);
        return;
      }
      const stored = sessionStorage.getItem(key);
      setReturnToMem(stored && String(stored).trim() ? String(stored) : null);
    } catch {
      setReturnToMem(null);
    }
  }, [idObra, returnTo]);

  function isExternalHref(href: string) {
    const raw = String(href || "").trim();
    return raw.startsWith("//") || /^(?:[a-z][a-z0-9+.-]*:)?\/\//i.test(raw) || /^[a-z][a-z0-9+.-]*:/i.test(raw);
  }

  function voltar() {
    const target = String(returnTo || "").trim() || String(returnToMem || "").trim();
    if (target && !isExternalHref(target)) {
      router.push(target);
      return;
    }
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
      return;
    }
    router.push(`/dashboard/engenharia/obras/${idObra}/planilha`);
  }

  function getBackTargetUrl() {
    const target = String(returnTo || "").trim() || String(returnToMem || "").trim();
    if (target && !isExternalHref(target)) return target;
    return `/dashboard/engenharia/obras/${idObra}/planilha`;
  }

  function buildAnalysisUrl(targetCodigo: string, trail: string[], returnToHref: string) {
    const qs = new URLSearchParams();
    if (trail.length) qs.set("trail", trail.join(","));
    const pid = planilhaInfo?.idPlanilha || planilhaId;
    if (pid) qs.set("planilhaId", String(pid));
    qs.set("returnTo", returnToHref);
    return `/dashboard/engenharia/obras/${idObra}/planilha/servicos/${encodeURIComponent(targetCodigo)}?${qs.toString()}`;
  }

  function getSelfUrl() {
    const qs = new URLSearchParams();
    if (trailCodes.length) qs.set("trail", trailCodes.join(","));
    if (planilhaId) qs.set("planilhaId", String(planilhaId));
    qs.set("returnTo", getBackTargetUrl());
    return `/dashboard/engenharia/obras/${idObra}/planilha/servicos/${encodeURIComponent(codigoServico)}?${qs.toString()}`;
  }

  const breadcrumbComposicoes = useMemo(() => {
    const codes = [...trailCodes, codigoServico].filter((c) => String(c || "").trim());
    const out: Array<{ codigo: string; href: string }> = [];
    const baseReturnTo = getBackTargetUrl();
    let currentTrail: string[] = [];
    let currentReturnTo = baseReturnTo;
    for (const c of codes) {
      const href = buildAnalysisUrl(c, currentTrail, currentReturnTo);
      out.push({ codigo: c, href });
      currentReturnTo = href;
      currentTrail = [...currentTrail, c];
    }
    return out;
  }, [codigoServico, planilhaId, planilhaInfo?.idPlanilha, planilhaInfo?.nome, returnTo, returnToMem, trailCodes]);

  const bancosBase = useMemo(() => ["SINAPI", "Próprio", "SBC", "SICRO3"], []);
  const bancosOptions = useMemo(() => Array.from(new Set([...bancosBase, ...bancosCustom])), [bancosBase, bancosCustom]);

  function excluirBancoCustom(banco: string) {
    setBancosCustom((prev) => prev.filter((b) => b !== banco));
  }

  const previstoPlanilhaTitle = useMemo(() => {
    return "Serviço";
  }, []);

  const [fonteDropdownOpen, setFonteDropdownOpen] = useState(false);
  const fonteDropdownRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (fonteDropdownRef.current && !fonteDropdownRef.current.contains(e.target as Node)) {
        setFonteDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const previstoFonte = useMemo(() => {
    const raw = String(previstoRows?.[0]?.fonte || "").trim().toUpperCase();
    if (!raw) return "";
    if (raw.includes("SINAPI")) return "SINAPI";
    if (raw.includes("SBC")) return "SBC";
    return raw;
  }, [previstoRows, previstoServicoMeta]);

  const previstoServicoNome = useMemo(() => {
    const a = String(previstoServicoMeta?.descricao || "").trim();
    if (a) return a;
    return String(previstoRows?.[0]?.servicos || "").trim();
  }, [previstoRows, previstoServicoMeta]);

  const previstoUnd = useMemo(() => {
    const a = String(previstoServicoMeta?.und || "").trim();
    if (a) return a;
    return String(previstoRows?.[0]?.und || "").trim();
  }, [previstoRows, previstoServicoMeta]);

  const previstoTotal = useMemo(() => {
    let total = 0;
    for (const r of previstoRows) {
      const n = parseNumberLoose(r.valorParcial);
      if (n != null) total += n;
    }
    return Number(total.toFixed(2));
  }, [previstoRows]);

  const fontePlanilhaServico = useMemo(() => {
    const raw = String(previstoRows?.[0]?.fonte || "").trim().toUpperCase();
    if (!raw) return "";
    if (raw.includes("SINAPI")) return "SINAPI";
    if (raw.includes("SBC")) return "SBC";
    return raw;
  }, [previstoRows]);

  const bdiPercent = useMemo(() => {
    const sinapi = planilhaParams?.bdiServicosSinapi;
    const sbc = planilhaParams?.bdiServicosSbc;
    if (fontePlanilhaServico === "SINAPI") return sinapi != null && Number.isFinite(sinapi) ? sinapi : 0;
    if (fontePlanilhaServico === "SBC") return sbc != null && Number.isFinite(sbc) ? sbc : 0;
    if (sinapi != null && Number.isFinite(sinapi) && sinapi > 0) return sinapi;
    if (sbc != null && Number.isFinite(sbc) && sbc > 0) return sbc;
    return 0;
  }, [planilhaParams, fontePlanilhaServico]);

  const totalBase = useMemo(() => {
    let total = 0;
    for (const i of itens) {
      const q = parseNumberLoose(i.quantidade);
      const v = parseNumberLoose(i.valorUnitario);
      if (q == null || v == null) continue;
      total += q * v;
    }
    return Number(total.toFixed(2));
  }, [itens]);

  const totalInsumosBase = useMemo(() => {
    let total = 0;
    for (const i of itens) {
      if (isComposicaoTipo(i.tipoItem)) continue;
      const q = parseNumberLoose(i.quantidade);
      const v = parseNumberLoose(i.valorUnitario);
      if (q == null || v == null) continue;
      total += q * v;
    }
    return Number(total.toFixed(2));
  }, [itens]);

  const totalComposicoesBase = useMemo(() => {
    let total = 0;
    for (const i of itens) {
      if (!isComposicaoTipo(i.tipoItem)) continue;
      const q = parseNumberLoose(i.quantidade);
      const v = parseNumberLoose(i.valorUnitario);
      if (q == null || v == null) continue;
      total += q * v;
    }
    return Number(total.toFixed(2));
  }, [itens]);

  const totalEquipamentosBase = useMemo(() => {
    let total = 0;
    for (const i of itens) {
      if (isComposicaoTipo(i.tipoItem)) continue;
      const key = normalizeHeader(String(i.tipoItem || ""));
      if (!key.includes("equipamento")) continue;
      const q = parseNumberLoose(i.quantidade);
      const v = parseNumberLoose(i.valorUnitario);
      if (q == null || v == null) continue;
      total += q * v;
    }
    return Number(total.toFixed(2));
  }, [itens]);

  const totalMateriaisBase = useMemo(() => {
    let total = 0;
    for (const i of itens) {
      if (isComposicaoTipo(i.tipoItem)) continue;
      const key = normalizeHeader(String(i.tipoItem || ""));
      if (key === "mao_de_obra") continue;
      if (key.includes("equipamento")) continue;
      const q = parseNumberLoose(i.quantidade);
      const v = parseNumberLoose(i.valorUnitario);
      if (q == null || v == null) continue;
      total += q * v;
    }
    return Number(total.toFixed(2));
  }, [itens]);

  const totalComBDI = useMemo(() => {
    const t = totalBase * (1 + Number(bdiPercent || 0) / 100);
    return Number(t.toFixed(2));
  }, [totalBase, bdiPercent]);

  const totalMaoBase = useMemo(() => {
    let total = 0;
    for (const i of itens) {
      if (normalizeHeader(String(i.tipoItem || "")) !== "mao_de_obra") continue;
      const q = parseNumberLoose(i.quantidade);
      const v = parseNumberLoose(i.valorUnitario);
      if (q == null || v == null) continue;
      total += q * v;
    }
    return Number(total.toFixed(2));
  }, [itens]);

  const lsPercent = useMemo(() => {
    const sinapi = planilhaParams?.encSociaisSemDesSinapi;
    const sbc = planilhaParams?.encSociaisSemDesSbc;
    if (fontePlanilhaServico === "SINAPI") return sinapi != null && Number.isFinite(sinapi) ? sinapi : 0;
    if (fontePlanilhaServico === "SBC") return sbc != null && Number.isFinite(sbc) ? sbc : 0;
    if (sinapi != null && Number.isFinite(sinapi) && sinapi > 0) return sinapi;
    if (sbc != null && Number.isFinite(sbc) && sbc > 0) return sbc;
    return 0;
  }, [planilhaParams, fontePlanilhaServico]);

  const descontoPercent = useMemo(() => {
    const sinapi = planilhaParams?.descontoSinapi;
    const sbc = planilhaParams?.descontoSbc;
    if (fontePlanilhaServico === "SINAPI") return sinapi != null && Number.isFinite(sinapi) ? sinapi : 0;
    if (fontePlanilhaServico === "SBC") return sbc != null && Number.isFinite(sbc) ? sbc : 0;
    if (sinapi != null && Number.isFinite(sinapi) && sinapi > 0) return sinapi;
    if (sbc != null && Number.isFinite(sbc) && sbc > 0) return sbc;
    return 0;
  }, [planilhaParams, fontePlanilhaServico]);

  const totalComLS = useMemo(() => {
    const mao = totalMaoBase * (1 + Number(lsPercent || 0) / 100);
    const total = (totalBase - totalMaoBase) + mao;
    return Number(total.toFixed(2));
  }, [totalBase, totalMaoBase, lsPercent]);

  const totalSemBDI = useMemo(() => Number(totalComLS || 0), [totalComLS]);

  const totalSemBDIComDesconto = useMemo(() => {
    const d = Number(descontoPercent || 0);
    if (!d || !Number.isFinite(d) || d <= 0) return null;
    return Number((Number(totalSemBDI || 0) * (1 - d / 100)).toFixed(2));
  }, [descontoPercent, totalSemBDI]);

  const totalComLSComBDI = useMemo(() => {
    const t = totalComLS * (1 + Number(bdiPercent || 0) / 100);
    return Number(t.toFixed(2));
  }, [totalComLS, bdiPercent]);

  const totalComDesconto = useMemo(() => {
    const d = Number(descontoPercent || 0);
    if (!d || !Number.isFinite(d) || d <= 0) return totalComLSComBDI;
    const t = totalComLSComBDI * (1 - d / 100);
    return Number(t.toFixed(2));
  }, [totalComLSComBDI, descontoPercent]);

  const previstoCalcUnit = useMemo(() => (Number(descontoPercent || 0) > 0 ? Number(totalComDesconto || 0) : Number(totalComLSComBDI || 0)), [descontoPercent, totalComDesconto, totalComLSComBDI]);

  const previstoCalcTotal = useMemo(() => {
    let total = 0;
    for (const r of previstoRows) {
      const q = parseNumberLoose(r.quant);
      if (q == null) continue;
      total += q * Number(previstoCalcUnit || 0);
    }
    return Number(total.toFixed(2));
  }, [previstoRows, previstoCalcUnit]);

  async function calcularTotalComLSDeComposicao(codigo: string) {
    const code = String(codigo || "").trim().toUpperCase();
    if (!code) return null;
    const cached = compTotalCacheRef.current.get(code);
    if (cached != null) return cached;
    if (!definedComposicoesCodes.has(code)) return null;
    const qs = planilhaId ? `?planilhaId=${encodeURIComponent(String(planilhaId))}` : "";
    const res = await authFetch(`/api/v1/engenharia/obras/${idObra}/planilha/servicos/${encodeURIComponent(code)}/composicao-itens${qs}`);
    const json = await res.json().catch(() => null);
    if (!res.ok || !json?.success) throw new Error(json?.message || `Erro ao carregar composição ${code}`);
    const list = Array.isArray(json.data?.itens) ? json.data.itens : [];
    if (!list.length) return null;
    let totalBaseLocal = 0;
    let totalMaoLocal = 0;
    for (const it of list) {
      const tipo = String(it.tipoItem || "").toUpperCase();
      const q = parseNumberLoose(it.quantidade);
      const v = parseNumberLoose(it.valorUnitario);
      if (q == null || v == null) continue;
      const t = q * v;
      totalBaseLocal += t;
      if (tipo === "MAO_DE_OBRA") totalMaoLocal += t;
    }
    totalBaseLocal = Number(totalBaseLocal.toFixed(2));
    totalMaoLocal = Number(totalMaoLocal.toFixed(2));
    const maoComLS = totalMaoLocal * (1 + Number(lsPercent || 0) / 100);
    const totalComLSLocal = Number(((totalBaseLocal - totalMaoLocal) + maoComLS).toFixed(2));
    compTotalCacheRef.current.set(code, totalComLSLocal);
    return totalComLSLocal;
  }

  async function obterMetaCodigo(tipoItem: string, codigo: string) {
    const code = String(codigo || "").trim().toUpperCase();
    if (!code) return null;
    const qs = new URLSearchParams();
    if (planilhaId) qs.set("planilhaId", String(planilhaId));

    const isComp = isComposicaoTipo(tipoItem);
    const url = isComp
      ? `/api/v1/engenharia/obras/${idObra}/planilha/servicos/${encodeURIComponent(code)}/meta?${qs.toString()}`
      : `/api/v1/engenharia/obras/${idObra}/planilha/sinapi/insumos/${encodeURIComponent(code)}/meta?${qs.toString()}`;
    const res = await authFetch(url);
    const json = await res.json().catch(() => null);
    if (!res.ok || !json?.success) return null;
    return json.data || null;
  }

  async function aplicarMetaNoItem(idx: number) {
    const row = itens[idx];
    if (!row) return;
    const code = String(row.codigoItem || "").trim().toUpperCase();
    if (!code) return;
    const meta = await obterMetaCodigo(row.tipoItem, code);
    if (!meta) return;
    setItens((p) =>
      p.map((x, i) => {
        if (i !== idx) return x;
        const descricao = meta?.descricao != null ? String(meta.descricao || "") : x.descricao;
        const und = meta?.und != null ? String(meta.und || "") : x.und;
        const banco = meta?.fonte != null ? String(meta.fonte || "") : meta?.banco != null ? String(meta.banco || "") : x.banco;
        return { ...x, descricao, und, banco };
      })
    );
  }

  async function atualizarValorComposicaoNoItem(rowIdx: number, codigo: string) {
    try {
      if (!idObra) return;
      const code = String(codigo || "").trim().toUpperCase();
      if (!code) return;
      if (!definedComposicoesCodes.has(code)) {
        setItens((p) => p.map((x, i) => (i === rowIdx ? { ...x, valorUnitario: "0" } : x)));
        return;
      }
      const totalComLSLocal = await calcularTotalComLSDeComposicao(code);
      if (totalComLSLocal == null) {
        setItens((p) => p.map((x, i) => (i === rowIdx ? { ...x, valorUnitario: "0" } : x)));
        return;
      }
      setItens((p) => {
        const row = p[rowIdx];
        if (!row) return p;
        return p.map((x, i) =>
          i === rowIdx ? { ...x, valorUnitario: totalComLSLocal.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) } : x
        );
      });
    } catch (e: any) {
      setItens((p) => p.map((x, i) => (i === rowIdx ? { ...x, valorUnitario: "0" } : x)));
      setErr(e?.message || "Erro ao atualizar valor da composição");
    }
  }

  function criarNovaComposicao() {
    if (!idObra) return;
    const sugestao = `${codigoServico || "COMP"}-NOVA`;
    const entrada = window.prompt("Informe o código da nova composição:", sugestao);
    const codigoNovo = String(entrada || "").trim().toUpperCase();
    if (!codigoNovo) return;
    if (!/^[A-Z0-9._/-]+$/.test(codigoNovo)) {
      setErr("Código inválido. Use apenas letras, números, ponto, traço, barra ou underline.");
      return;
    }
    const nextTrail = [...trailCodes, codigoServico].filter(Boolean);
    router.push(buildAnalysisUrl(codigoNovo, nextTrail, getSelfUrl()));
  }

  function navegarParaIndice(next: number) {
    if (!navPlanilhaServicos.length) return;
    const idx = Math.max(0, Math.min(navPlanilhaServicos.length - 1, next));
    const alvo = navPlanilhaServicos[idx];
    if (!alvo?.codigo) return;
    router.push(
      `/dashboard/engenharia/obras/${idObra}/planilha/servicos/${encodeURIComponent(alvo.codigo)}?returnTo=${encodeURIComponent(getBackTargetUrl())}`
    );
  }

  const itensIdx = useMemo(() => itens.map((r, idx) => ({ r, idx })), [itens]);
  const itensComposicoes = useMemo(() => itensIdx.filter(({ r }) => isComposicaoTipo(r.tipoItem)), [itensIdx]);
  const itensInsumos = useMemo(() => itensIdx.filter(({ r }) => !isComposicaoTipo(r.tipoItem)), [itensIdx]);
  const itensMateriais = useMemo(
    () =>
      itensIdx.filter(({ r }) => {
        if (isComposicaoTipo(r.tipoItem)) return false;
        const key = normalizeHeader(String(r.tipoItem || ""));
        if (key === "mao_de_obra") return false;
        if (key.includes("equipamento")) return false;
        if (key === "servicos") return false;
        if (key === "especiais") return false;
        return true;
      }),
    [itensIdx]
  );

  const itensEquipamentos = useMemo(
    () =>
      itensIdx.filter(({ r }) => {
        if (isComposicaoTipo(r.tipoItem)) return false;
        const key = normalizeHeader(String(r.tipoItem || ""));
        return key.includes("equipamento");
      }),
    [itensIdx]
  );

  const itensServicos = useMemo(
    () =>
      itensIdx.filter(({ r }) => {
        if (isComposicaoTipo(r.tipoItem)) return false;
        const key = normalizeHeader(String(r.tipoItem || ""));
        return key === "servicos";
      }),
    [itensIdx]
  );

  const itensEspeciais = useMemo(
    () =>
      itensIdx.filter(({ r }) => {
        if (isComposicaoTipo(r.tipoItem)) return false;
        const key = normalizeHeader(String(r.tipoItem || ""));
        return key === "especiais";
      }),
    [itensIdx]
  );

  const itensMaoDeObra = useMemo(
    () =>
      itensIdx.filter(({ r }) => {
        if (isComposicaoTipo(r.tipoItem)) return false;
        const key = normalizeHeader(String(r.tipoItem || ""));
        return key === "mao_de_obra";
      }),
    [itensIdx]
  );

  function categoriaItem(r: ItemRow) {
    if (isComposicaoTipo(r.tipoItem)) return "composicoes";
    const key = normalizeHeader(String(r.tipoItem || ""));
    if (key.includes("equipamento")) return "equipamentos";
    if (key === "servicos") return "servicos";
    if (key === "especiais") return "especiais";
    if (key === "mao_de_obra") return "mao_de_obra";
    return "materiais";
  }

  const itensFiltradosOrdenados = useMemo(() => {
    const order = new Map<string, number>([
      ["composicoes", 1],
      ["materiais", 2],
      ["equipamentos", 3],
      ["servicos", 4],
      ["especiais", 5],
      ["mao_de_obra", 6],
    ]);
    return itensIdx
      .filter(({ r }) => {
        const cat = categoriaItem(r);
        if (cat === "composicoes") return itensView.composicoes;
        if (cat === "materiais") return itensView.materiais;
        if (cat === "equipamentos") return itensView.equipamentos;
        if (cat === "servicos") return itensView.servicos;
        if (cat === "especiais") return itensView.especiais;
        return true;
      })
      .slice()
      .sort((a, b) => {
        const ao = order.get(categoriaItem(a.r)) ?? 99;
        const bo = order.get(categoriaItem(b.r)) ?? 99;
        if (ao !== bo) return ao - bo;
        return a.idx - b.idx;
      });
  }, [itensIdx, itensView]);

  function tipoMeta(tipo: string) {
    const key = normalizeHeader(String(tipo || ""));
    if (key === "composicao" || key === "composicao_auxiliar") return { label: "Composição", Icon: Layers, key };
    if (key === "material" || key === "insumo") return { label: "Material", Icon: BrickWall, key };
    if (key === "mao_de_obra") return { label: "Mão de obra", Icon: HardHat, key };
    if (key.includes("equipamento") && key.includes("aquisicao")) return { label: "Equipamento (Aquisição)", Icon: Wrench, key };
    if (key.includes("equipamento") && key.includes("locacao")) return { label: "Equipamento (Locação)", Icon: Wrench, key };
    if (key === "servicos") return { label: "Serviços", Icon: Layers, key };
    if (key === "especiais") return { label: "Especiais", Icon: Layers, key };
    const t = String(tipo || "").trim() || "Tipo";
    return { label: t, Icon: Layers, key: key || "tipo" };
  }

  function px(n: number) {
    return `${Math.max(0, Math.round(Number(n) || 0))}px`;
  }

  function sanitizeQtdInput(raw: string) {
    const s = String(raw ?? "");
    let out = "";
    let sep: "." | "," | null = null;
    for (let i = 0; i < s.length; i++) {
      const ch = s[i] || "";
      if (ch >= "0" && ch <= "9") {
        out += ch;
        continue;
      }
      if (ch === "." || ch === ",") {
        if (sep == null) {
          sep = ch;
          out += ch;
        }
      }
    }
    return out;
  }

  function fmtQtd(v: unknown) {
    const n = parseNumberLoose(v);
    if (n == null) return "";
    return n.toLocaleString("pt-BR", { minimumFractionDigits: 3, maximumFractionDigits: 3 });
  }

  function fmtTotal(v: unknown) {
    const n = typeof v === "number" ? v : parseNumberLoose(v);
    if (n == null) return "";
    return Number(n).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function renderItensTabela(
    list: Array<{ r: ItemRow; idx: number }>,
    rowBg: string | ((r: ItemRow) => string),
    opts?: { showFiltro?: boolean }
  ) {
    const colCount =
      (displayPrefs.colTipo ? 1 : 0) +
      (displayPrefs.colCodigo ? 1 : 0) +
      (displayPrefs.colBanco ? 1 : 0) +
      (displayPrefs.colDescricao ? 1 : 0) +
      (displayPrefs.colUnd ? 1 : 0) +
      (displayPrefs.colQtd ? 1 : 0) +
      (displayPrefs.colValorUnit ? 1 : 0) +
      (displayPrefs.colTotal ? 1 : 0) +
      (displayPrefs.colCentroCusto ? 1 : 0) +
      1;
    const w = {
      tipo: displayPrefs.wTipoPx,
      codigo: displayPrefs.wCodigoPx,
      banco: displayPrefs.wBancoPx,
      descricao: displayPrefs.wDescricaoPx,
      und: displayPrefs.wUndPx,
      qtd: displayPrefs.wQtdPx,
      valorUnit: displayPrefs.wValorUnitPx,
      total: displayPrefs.wTotalPx,
      cc: displayPrefs.wCentroCustoPx,
      acoes: displayPrefs.wAcoesPx,
    };
    const fs = {
      tipo: displayPrefs.fsTipoPx,
      codigo: displayPrefs.fsCodigoPx,
      banco: displayPrefs.fsBancoPx,
      descricao: displayPrefs.fsDescricaoPx,
      und: displayPrefs.fsUndPx,
      qtd: displayPrefs.fsQtdPx,
      valorUnit: displayPrefs.fsValorUnitPx,
      total: displayPrefs.fsTotalPx,
      cc: displayPrefs.fsCentroCustoPx,
      acoes: displayPrefs.fsAcoesPx,
    };
    const cellW = (widthPx: number) => ({ width: px(widthPx), minWidth: px(widthPx), maxWidth: px(widthPx) });
    return (
      <div className="overflow-auto">
        {opts?.showFiltro ? (
          <div className="mb-2 flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <button
                className="rounded border bg-white px-3 py-1.5 text-sm hover:bg-slate-50"
                type="button"
                onClick={() => setItensView({ composicoes: true, materiais: true, equipamentos: true, servicos: true, especiais: true })}
              >
                Todos
              </button>
              <button
                className="rounded border bg-white px-3 py-1.5 text-sm hover:bg-slate-50"
                type="button"
                onClick={() => setItensView({ composicoes: false, materiais: false, equipamentos: false, servicos: false, especiais: false })}
              >
                Nenhum
              </button>
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={itensView.composicoes}
                onChange={(e) => setItensView((p) => ({ ...p, composicoes: Boolean(e.target.checked) }))}
              />
              <span>Composições</span>
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={itensView.materiais}
                onChange={(e) => setItensView((p) => ({ ...p, materiais: Boolean(e.target.checked) }))}
              />
              <span>Materiais</span>
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={itensView.equipamentos}
                onChange={(e) => setItensView((p) => ({ ...p, equipamentos: Boolean(e.target.checked) }))}
              />
              <span>Equipamentos</span>
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={itensView.servicos}
                onChange={(e) => setItensView((p) => ({ ...p, servicos: Boolean(e.target.checked) }))}
              />
              <span>Serviços</span>
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={itensView.especiais}
                onChange={(e) => setItensView((p) => ({ ...p, especiais: Boolean(e.target.checked) }))}
              />
              <span>Especiais</span>
            </label>
          </div>
        ) : null}
        <table className="w-full text-sm" style={{ minWidth: "1100px" }}>
          <thead className="bg-slate-100 text-center text-slate-800 font-semibold">
            <tr>
              {displayPrefs.colTipo ? (
                <th className="px-3 py-2" style={cellW(w.tipo)}>
                  Tipo
                </th>
              ) : null}
              {displayPrefs.colCodigo ? (
                <th className="px-3 py-2" style={cellW(w.codigo)}>
                  Código
                </th>
              ) : null}
              {displayPrefs.colBanco ? (
                <th className="px-3 py-2" style={cellW(w.banco)}>
                  Banco
                </th>
              ) : null}
              {displayPrefs.colDescricao ? (
                <th className="px-3 py-2" style={cellW(w.descricao)}>
                  Descrição
                </th>
              ) : null}
              {displayPrefs.colUnd ? (
                <th className="px-3 py-2" style={cellW(w.und)}>
                  UND
                </th>
              ) : null}
              {displayPrefs.colQtd ? (
                <th className="px-3 py-2" style={cellW(w.qtd)}>
                  Qtd
                </th>
              ) : null}
              {displayPrefs.colValorUnit ? (
                <th className="px-3 py-2" style={cellW(w.valorUnit)}>
                  Valor Unit
                </th>
              ) : null}
              {displayPrefs.colTotal ? (
                <th className="px-3 py-2" style={cellW(w.total)}>
                  Total
                </th>
              ) : null}
              {displayPrefs.colCentroCusto ? (
                <th className="px-3 py-2" style={cellW(w.cc)}>
                  Centro de custo
                </th>
              ) : null}
              <th className="px-3 py-2" style={cellW(w.acoes)}>
                Ações
              </th>
            </tr>
          </thead>
          <tbody>
            {list.map(({ r, idx }) => {
              const bg = typeof rowBg === "function" ? rowBg(r) : rowBg;
              const q = parseNumberLoose(r.quantidade);
              const bancoInOptions = !r.banco || bancosOptions.includes(r.banco);
              const selectBancoValue = bancoInOptions ? r.banco : "__OUTRO__";
              const meta = tipoMeta(r.tipoItem);
              const isComposicao = isComposicaoTipo(r.tipoItem);
              const codigoComposicao = String(r.codigoItem || "").trim().toUpperCase();
              const isDefinida = Boolean(codigoComposicao) && definedComposicoesCodes.has(codigoComposicao);
              const vRaw = parseNumberLoose(r.valorUnitario);
              const v = vRaw;
              const total = q != null && v != null ? q * v : null;
              const displayValorUnit = r.valorUnitario;
              return (
                <tr key={idx} className="border-t" style={{ backgroundColor: bg }}>
                  {displayPrefs.colTipo ? (
                    <td className="px-3 py-2" style={{ ...cellW(w.tipo), fontSize: px(fs.tipo) }}>
                      <button
                        className="rounded border bg-white p-2 hover:bg-slate-50 disabled:opacity-60"
                        type="button"
                        disabled
                        title={meta.label}
                        style={{ fontSize: px(fs.tipo) }}
                      >
                        <meta.Icon className="h-4 w-4" />
                      </button>
                    </td>
                  ) : null}
                  {displayPrefs.colCodigo ? (
                    <td className="px-3 py-2" style={{ ...cellW(w.codigo), fontSize: px(fs.codigo) }}>
                      <div className="flex items-center gap-2">
                        <input
                          className="input bg-white flex-1 min-w-0"
                          value={r.codigoItem}
                          onChange={(e) => setItens((p) => p.map((x, i) => (i === idx ? { ...x, codigoItem: e.target.value } : x)))}
                          onBlur={async () => {
                            await aplicarMetaNoItem(idx);
                            const isComp = isComposicao;
                            const code = String(r.codigoItem || "").trim().toUpperCase();
                            if (isComp && code) await atualizarValorComposicaoNoItem(idx, code);
                          }}
                          style={{ fontSize: px(fs.codigo) }}
                        />
                        {isComposicao && codigoComposicao ? (
                          <button
                            className="rounded border bg-white p-2 hover:bg-slate-50 disabled:opacity-60"
                            type="button"
                            disabled={loading}
                            title={
                              isDefinida
                                ? "Composição definida (clique para abrir)"
                                : "Composição não definida (clique para abrir/definir)"
                            }
                            onClick={() =>
                              router.push(buildAnalysisUrl(codigoComposicao, [...trailCodes, codigoServico].filter(Boolean), getSelfUrl()))
                            }
                          >
                            {isDefinida ? <CheckCircle2 className="h-4 w-4 text-green-700" /> : <XCircle className="h-4 w-4 text-red-700" />}
                          </button>
                        ) : null}
                      </div>
                    </td>
                  ) : null}
                  {displayPrefs.colBanco ? (
                    <td className="px-3 py-2" style={{ ...cellW(w.banco), fontSize: px(fs.banco) }}>
                    <div className="flex items-center gap-2">
                      <select
                        className="input bg-white"
                        value={selectBancoValue}
                        style={{ ...cellW(w.banco), fontSize: px(fs.banco) }}
                        disabled
                      >
                        <option value="">(sem banco)</option>
                        {bancosOptions.map((b) => (
                          <option key={b} value={b}>
                            {b}
                          </option>
                        ))}
                      </select>
                    </div>
                  </td>
                  ) : null}
                  {displayPrefs.colDescricao ? (
                    <td className="px-3 py-2" style={{ ...cellW(w.descricao), fontSize: px(fs.descricao) }}>
                    <input
                      className="input bg-white"
                      value={r.descricao}
                      readOnly
                      style={{ fontSize: px(fs.descricao) }}
                    />
                  </td>
                  ) : null}
                  {displayPrefs.colUnd ? (
                    <td className="px-3 py-2" style={{ ...cellW(w.und), fontSize: px(fs.und) }}>
                    <input
                      className="input bg-white"
                      value={r.und}
                      readOnly
                      style={{ ...cellW(w.und), fontSize: px(fs.und) }}
                    />
                  </td>
                  ) : null}
                  {displayPrefs.colQtd ? (
                    <td className="px-3 py-2 text-right" style={{ ...cellW(w.qtd), fontSize: px(fs.qtd) }}>
                    <input
                      className="input bg-white text-right"
                      value={r.quantidade}
                      onChange={(e) => {
                        const next = sanitizeQtdInput(e.target.value);
                        setItens((p) => p.map((x, i) => (i === idx ? { ...x, quantidade: next } : x)));
                      }}
                      onBlur={() => {
                        setItens((p) => {
                          const row = p[idx];
                          if (!row) return p;
                          const next = fmtQtd(row.quantidade);
                          if (next === row.quantidade) return p;
                          return p.map((x, i) => (i === idx ? { ...x, quantidade: next } : x));
                        });
                      }}
                      style={{ ...cellW(w.qtd), fontSize: px(fs.qtd) }}
                    />
                  </td>
                  ) : null}
                  {displayPrefs.colValorUnit ? (
                    <td className="px-3 py-2 text-right" style={{ ...cellW(w.valorUnit), fontSize: px(fs.valorUnit) }}>
                    {isComposicao ? (
                      <div className="flex items-center gap-2">
                        <input
                          className="input bg-white text-right flex-1 min-w-0"
                          value={displayValorUnit}
                          readOnly
                          title={
                            !codigoComposicao
                              ? "Informe o código da composição"
                              : isDefinida
                                ? "Valor unitário da composição"
                                : "Composição ainda não definida na planilha"
                          }
                          style={{ fontSize: px(fs.valorUnit) }}
                        />
                      </div>
                    ) : (
                      <input
                        className="input bg-white text-right"
                        value={r.valorUnitario}
                        onChange={(e) => setItens((p) => p.map((x, i) => (i === idx ? { ...x, valorUnitario: e.target.value } : x)))}
                        style={{ ...cellW(w.valorUnit), fontSize: px(fs.valorUnit) }}
                      />
                    )}
                  </td>
                  ) : null}
                  {displayPrefs.colTotal ? (
                    <td className="px-3 py-2 text-right" style={{ ...cellW(w.total), fontSize: px(fs.total) }}>
                      {total == null ? "" : fmtTotal(total)}
                    </td>
                  ) : null}
                  {displayPrefs.colCentroCusto ? (
                    <td className="px-3 py-2" style={{ ...cellW(w.cc), fontSize: px(fs.cc) }}>
                      <span className="text-slate-700">{r.codigoCentroCusto ? r.codigoCentroCusto : ""}</span>
                  </td>
                  ) : null}
                  <td className="px-3 py-2" style={{ ...cellW(w.acoes), fontSize: px(fs.acoes) }}>
                    <button
                      className="rounded border bg-white p-2 text-red-700 hover:bg-slate-50 disabled:opacity-60"
                      type="button"
                      title="Remover"
                      onClick={() => setItens((p) => p.filter((_, i) => i !== idx))}
                      disabled={loading}
                      style={{ fontSize: px(fs.acoes) }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              );
            })}
            {!list.length ? (
              <tr>
                <td colSpan={colCount} className="px-3 py-6 text-center text-slate-500">
                  Sem itens.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    );
  }
 
  function exportarCsvItens(list: ItemRow[], fileName: string) {
    const sep = ";";
    const headers = ["tipo", "codigo", "banco", "descricao", "und", "quantidade", "valor_unit", "centro_custo"];
    const lines = [headers.join(sep)];
    for (const r of list) {
      lines.push(
        [
          String(r.tipoItem || ""),
          String(r.codigoItem || ""),
          String(r.banco || ""),
          String(r.descricao || ""),
          String(r.und || ""),
          String(r.quantidade || ""),
          String(r.valorUnitario || ""),
          String(r.codigoCentroCusto || ""),
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
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    setOkMsg("CSV exportado.");
  }

  function imprimirComposicao(
    title: string,
    groups: Array<{ label: string; itens: ItemRow[]; bg: string }>,
    summary?: {
      totalInsumosBase: number;
      totalComposicoesBase: number;
      totalMaoBase: number;
      totalBase: number;
      lsPercent: number;
      totalComLS: number;
      bdiPercent: number;
      totalComLSComBDI: number;
    }
  ) {
    const w = window.open("", "_blank");
    if (!w) {
      window.print();
      return;
    }
    const fw = printPrefs.headerFontWeight === "bold" ? 700 : printPrefs.headerFontWeight === "normal" ? 400 : 600;
    const top = Math.max(0, Number(printPrefs.topToHeaderPx || 0));
    const headerFontSize = Math.max(8, Math.min(16, Number(printPrefs.headerFontSizePx || 11)));
    const cabecalhoEmpresaHtml =
      printPrefs.includeEmpresaHeader && (empresaDocumentosLayout?.cabecalhoHtml || empresaDocumentosLayout?.logoDataUrl)
        ? `<div class="empresa-cabecalho" style="${empresaDocumentosLayout?.cabecalhoAlturaMm ? `min-height:${Number(empresaDocumentosLayout.cabecalhoAlturaMm)}mm;` : ""}">
            ${empresaDocumentosLayout?.cabecalhoHtml ? applyEmpresaDocTokens(empresaDocumentosLayout.cabecalhoHtml, empresaDocumentosLayout) : ""}
          </div>`
        : "";
    const acrescLS = summary ? Number((summary.totalComLS - summary.totalBase).toFixed(2)) : 0;
    const acrescBDI = summary ? Number((summary.totalComLSComBDI - summary.totalComLS).toFixed(2)) : 0;
    const resumoHtml = summary
      ? `
      <div class="resumo">
        <div class="cards">
          <div class="card"><div class="lab">Composições</div><div class="val">${escapeHtml(moeda(Number(summary.totalComposicoesBase || 0)))}</div></div>
          <div class="card"><div class="lab">Insumos</div><div class="val">${escapeHtml(moeda(Number(summary.totalInsumosBase || 0)))}</div></div>
        </div>
        <div class="kpis">
          <div class="kpi"><div class="lab">Subtotal (sem LS + BDI)</div><div class="val">${escapeHtml(moeda(Number(summary.totalBase || 0)))}</div></div>
          <div class="sep">→</div>
          <div class="kpi"><div class="lab">LS</div><div class="val">${escapeHtml(Number(summary.lsPercent || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }))}%</div><div class="sub">Acréscimo: ${escapeHtml(moeda(Number(acrescLS || 0)))}</div></div>
          <div class="sep">→</div>
          <div class="kpi kpi-hi"><div class="lab">Total (com LS)</div><div class="val">${escapeHtml(moeda(Number(summary.totalComLS || 0)))}</div></div>
          <div class="sep">→</div>
          <div class="kpi"><div class="lab">BDI</div><div class="val">${escapeHtml(Number(summary.bdiPercent || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }))}%</div><div class="sub">Acréscimo: ${escapeHtml(moeda(Number(acrescBDI || 0)))}</div></div>
          <div class="sep">→</div>
          <div class="kpi kpi-final"><div class="lab">Total final (LS + BDI)</div><div class="val">${escapeHtml(moeda(Number(summary.totalComLSComBDI || 0)))}</div></div>
        </div>
      </div>
    `
      : "";

    const cols = [
      displayPrefs.colTipo ? "Tipo" : null,
      displayPrefs.colCodigo ? "Código" : null,
      displayPrefs.colBanco ? "Banco" : null,
      displayPrefs.colDescricao ? "Descrição" : null,
      displayPrefs.colUnd ? "UND" : null,
      displayPrefs.colQtd ? "Qtd" : null,
      displayPrefs.colValorUnit ? "Valor Unit" : null,
      displayPrefs.colTotal ? "Total" : null,
      displayPrefs.colCentroCusto ? "Centro de custo" : null,
    ].filter(Boolean) as string[];

    const rowHtml = (r: ItemRow) => {
      const q = parseNumberLoose(r.quantidade);
      const v = parseNumberLoose(r.valorUnitario);
      const tot = q != null && v != null ? q * v : null;
      const cells: string[] = [];
      if (displayPrefs.colTipo) cells.push(`<td>${escapeHtml(r.tipoItem)}</td>`);
      if (displayPrefs.colCodigo) cells.push(`<td>${escapeHtml(r.codigoItem)}</td>`);
      if (displayPrefs.colBanco) cells.push(`<td>${escapeHtml(r.banco)}</td>`);
      if (displayPrefs.colDescricao) cells.push(`<td>${escapeHtml(r.descricao)}</td>`);
      if (displayPrefs.colUnd) cells.push(`<td>${escapeHtml(r.und)}</td>`);
      if (displayPrefs.colQtd) cells.push(`<td style="text-align:right">${escapeHtml(r.quantidade)}</td>`);
      if (displayPrefs.colValorUnit) cells.push(`<td style="text-align:right">${escapeHtml(r.valorUnitario)}</td>`);
      if (displayPrefs.colTotal) cells.push(`<td style="text-align:right">${tot == null ? "" : escapeHtml(moeda(Number(tot)))}</td>`);
      if (displayPrefs.colCentroCusto) cells.push(`<td>${escapeHtml(r.codigoCentroCusto || "")}</td>`);
      return `<tr>${cells.join("")}</tr>`;
    };

    const groupsHtml = groups
      .map((g) => {
        const ths = cols.map((c) => `<th>${escapeHtml(c)}</th>`).join("");
        const trs = g.itens.map(rowHtml).join("");
        return `
          <div class="g-title" style="background:${escapeHtml(g.bg)}">${escapeHtml(g.label)}</div>
          <table class="t">
            <thead><tr>${ths}</tr></thead>
            <tbody>${trs || `<tr><td colspan="${cols.length}" style="text-align:center;color:#64748b;padding:10px;">Sem itens</td></tr>`}</tbody>
          </table>
        `;
      })
      .join("");

    w.document.open();
    w.document.write(`<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>\u200B</title>
    <style>
      body { margin: 0; font-family: Arial, sans-serif; color: #0f172a; font-size: 9px; line-height: 1.12; }
      @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
      :root { --print-header-offset: 0px; }
      .h { position: fixed; top: ${top}px; left: 0; right: 0; background: #fff; padding: 6px 10px; z-index: 20; font-family: ${escapeHtml(
        printPrefs.headerFontFamily
      )}; font-size: ${headerFontSize}px; }
      .h * { line-height: 1.12; }
      .h-title { font-weight: ${fw}; }
      .c { padding: 6px 10px; position: relative; z-index: 1; }
      .sp { height: var(--print-header-offset); }
      .empresa-cabecalho { width: 100%; }
      .resumo { margin-top: 10px; border: 1px solid #e2e8f0; border-radius: 8px; padding: 8px; }
      .cards { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; }
      .card { border: 1px solid #e2e8f0; border-radius: 8px; padding: 6px 8px; }
      .lab { font-size: 10px; color: #475569; }
      .val { font-size: 12px; font-weight: 700; color: #0f172a; }
      .kpis { margin-top: 8px; display: flex; flex-wrap: wrap; align-items: stretch; gap: 6px; }
      .kpi { border: 1px solid #e2e8f0; border-radius: 8px; padding: 6px 8px; }
      .kpi .sub { margin-top: 2px; font-size: 10px; color: #64748b; }
      .kpi-hi { border-color: #6366f1; background: #eef2ff; }
      .kpi-final { border-color: #0f172a; background: #0f172a; }
      .kpi-final .lab, .kpi-final .val { color: #ffffff; }
      .sep { align-self: center; color: #94a3b8; padding: 0 2px; }
      .g-title { margin: 10px 0 6px 0; padding: 6px 8px; border: 1px solid #e2e8f0; font-weight: 700; }
      .t { width: 100%; border-collapse: collapse; }
      th, td { border: 1px solid #e2e8f0; padding: 4px 6px; vertical-align: top; }
      th { background: #f8fafc; text-align: center; padding: 6px 6px; }
    </style>
  </head>
  <body>
    <div class="h">
      ${cabecalhoEmpresaHtml}
      <div class="h-title">${escapeHtml(title)}</div>
      <div style="font-size:10px;color:#334155">Serviço: ${escapeHtml(codigoServico)} • Obra #${escapeHtml(idObra)}</div>
    </div>
    <div class="c">
      <div class="sp"></div>
      ${resumoHtml}
      ${groupsHtml}
    </div>
    <script>
      (function(){
        var tries=0,lastH=-1,stable=0;
        function m(){
          tries++;
          var h=document.querySelector('.h');
          var hh=h?Math.ceil(h.getBoundingClientRect().height):0;
          if(hh===lastH) stable++; else stable=0;
          lastH=hh;
          document.documentElement.style.setProperty('--print-header-offset',(hh+${top})+'px');
          if(stable>=2||tries>=20){ window.focus(); window.print(); window.close(); return; }
          requestAnimationFrame(m);
        }
        requestAnimationFrame(m);
      })();
    </script>
  </body>
</html>`);
    w.document.close();
  }

  async function abrirComposicaoPrimitiva() {
    if (!idObra || !codigoServico) return;
    try {
      setPrimitiveOpen(true);
      setPrimitiveLoading(true);
      setPrimitiveErr(null);
      setPrimitiveMeta(null);
      setPrimitiveRows([]);
      const qs = new URLSearchParams();
      if (planilhaId) qs.set("planilhaId", String(planilhaId));
      const res = await authFetch(
        `/api/v1/engenharia/obras/${idObra}/planilha/servicos/${encodeURIComponent(codigoServico)}/composicao-primitiva?${qs.toString()}`
      );
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.message || "Erro ao carregar composição primitiva");
      const meta = json.data?.meta || null;
      setPrimitiveMeta(
        meta
          ? {
              descricaoServico: meta.descricaoServico == null ? null : String(meta.descricaoServico || ""),
              undServico: meta.undServico == null ? null : String(meta.undServico || ""),
              updatedAt: meta.updatedAt == null ? null : String(meta.updatedAt || ""),
            }
          : null
      );
      const rows = Array.isArray(json.data?.rows) ? json.data.rows : [];
      setPrimitiveRows(
        rows.map((r: any) => ({
          tipoItem: String(r.tipoItem || ""),
          codigoItem: String(r.codigoItem || ""),
          banco: String(r.banco || ""),
          descricao: String(r.descricao || ""),
          und: String(r.und || ""),
          quantidade: r.quantidade == null ? 0 : Number(r.quantidade),
          valorUnitario: r.valorUnitario == null ? 0 : Number(r.valorUnitario),
          total: r.total == null ? 0 : Number(r.total),
        }))
      );
    } catch (e: any) {
      setPrimitiveErr(e?.message || "Erro ao gerar composição primitiva");
    } finally {
      setPrimitiveLoading(false);
    }
  }

  async function atualizarComposicaoPrimitiva() {
    if (!idObra || !codigoServico) return;
    try {
      setPrimitiveLoading(true);
      setPrimitiveErr(null);
      const qs = new URLSearchParams();
      qs.set("refresh", "1");
      if (planilhaId) qs.set("planilhaId", String(planilhaId));
      const res = await authFetch(`/api/v1/engenharia/obras/${idObra}/planilha/servicos/${encodeURIComponent(codigoServico)}/composicao-primitiva?${qs.toString()}`);
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.message || "Erro ao atualizar composição primitiva");
      const meta = json.data?.meta || null;
      setPrimitiveMeta(
        meta
          ? {
              descricaoServico: meta.descricaoServico == null ? null : String(meta.descricaoServico || ""),
              undServico: meta.undServico == null ? null : String(meta.undServico || ""),
              updatedAt: meta.updatedAt == null ? null : String(meta.updatedAt || ""),
            }
          : null
      );
      const rows = Array.isArray(json.data?.rows) ? json.data.rows : [];
      setPrimitiveRows(
        rows.map((r: any) => ({
          tipoItem: String(r.tipoItem || ""),
          codigoItem: String(r.codigoItem || ""),
          banco: String(r.banco || ""),
          descricao: String(r.descricao || ""),
          und: String(r.und || ""),
          quantidade: r.quantidade == null ? 0 : Number(r.quantidade),
          valorUnitario: r.valorUnitario == null ? 0 : Number(r.valorUnitario),
          total: r.total == null ? 0 : Number(r.total),
        }))
      );
      setOkMsg("Composição primitiva atualizada.");
    } catch (e: any) {
      setPrimitiveErr(e?.message || "Erro ao atualizar composição primitiva");
    } finally {
      setPrimitiveLoading(false);
    }
  }

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-7xl text-slate-900">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="mb-1" aria-live="polite">
            <div
              className={`inline-flex items-center gap-2 rounded-md border px-3 py-1 text-sm font-semibold ${
                bootLoading
                  ? "border-blue-200 bg-blue-50 text-blue-800"
                  : bootDone
                    ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                    : "border-slate-200 bg-white text-slate-700"
              }`}
            >
              <span
                className={`inline-block h-2.5 w-2.5 rounded-full ${
                  bootLoading ? "bg-blue-600 animate-pulse" : bootDone ? "bg-emerald-600" : "bg-slate-400"
                }`}
              />
              {bootLoading ? "Carregando página..." : bootDone ? "Página carregada" : "—"}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-1 text-xs text-slate-500">
            <button className="hover:underline" type="button" onClick={() => router.push("/dashboard/engenharia")} title="Ir para Engenharia">
              Engenharia
            </button>
            <span aria-hidden="true">→</span>
            <button className="hover:underline" type="button" onClick={() => router.push("/dashboard/engenharia/obras")} title="Ir para Obras">
              Obras
            </button>
            <span aria-hidden="true">→</span>
            <button
              className="hover:underline text-blue-600"
              type="button"
              onClick={() => router.push(`/dashboard/engenharia/obras/${idObra}`)}
              title="Ir para a Obra"
            >
              {`Obra #${idObra}${String(obraNome || "").trim() ? ` - ${obraNome}` : ""}`}
            </button>
            <span aria-hidden="true">→</span>
            <button
              className="hover:underline"
              type="button"
              onClick={() => {
                const qs = new URLSearchParams();
                const pid = planilhaInfo?.idPlanilha || planilhaId;
                if (pid) qs.set("planilhaId", String(pid));
                qs.set("returnTo", getSelfUrl());
                router.push(`/dashboard/engenharia/obras/${idObra}/planilha?${qs.toString()}`);
              }}
              title="Ir para Planilha orçamentária"
            >
              Planilha orçamentária
            </button>
            {planilhaInfo?.idPlanilha ? (
              <>
                <span aria-hidden="true">→</span>
                <span className="text-blue-600">{`planilha #${planilhaInfo.idPlanilha} - ${planilhaInfo.nome || "—"}`}</span>
              </>
            ) : null}
            {breadcrumbComposicoes.map((b, idx) => {
              const isLast = idx === breadcrumbComposicoes.length - 1;
              return (
                <span key={`${b.codigo}-${idx}`} className="inline-flex items-center gap-1">
                  <span aria-hidden="true">→</span>
                  {isLast ? (
                    <span className="text-blue-600">{`Análise de composição - ${b.codigo || "—"}`}</span>
                  ) : (
                    <button className="hover:underline" type="button" onClick={() => router.push(b.href)} title="Voltar para esta composição">
                      {`Análise de composição - ${b.codigo || "—"}`}
                    </button>
                  )}
                </span>
              );
            })}
          </div>
          <h1 className="text-2xl font-semibold">Análise de composição — {analysisTitle}</h1>
          <div className="mt-1 text-sm text-slate-700">
            {planilhaInfo?.idPlanilha ? <div className="font-semibold">{`Planilha: #${planilhaInfo.idPlanilha} - ${planilhaInfo.nome || "—"}`}</div> : null}
            {planilhaCtx?.idParametros ? <div>{`Parâmetros: #${planilhaCtx.idParametros} - ${planilhaCtx.parametrosNome || "—"}`}</div> : null}
            {planilhaCtx?.idFonteDados ? <div>{`Fonte de dados: #${planilhaCtx.idFonteDados} - ${planilhaCtx.fonteNome || "—"}`}</div> : null}
          </div>
        </div>
         <div className="flex items-center gap-2 flex-wrap">
           <button className="rounded-lg border bg-white px-4 py-2 text-sm hover:bg-slate-50" type="button" onClick={voltar} title="Voltar para a tela anterior">
             Voltar
           </button>
          <button
            className="rounded-lg border bg-white px-4 py-2 text-sm hover:bg-slate-50 disabled:opacity-60"
            type="button"
            onClick={async () => {
              await Promise.all([carregar(), carregarPrevistoPlanilha()]);
            }}
            disabled={loading}
            title="Recarregar composição e dados previstos da planilha"
          >
             Carregar
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
           <button className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white disabled:opacity-60" type="button" onClick={salvar} disabled={loading} title="Salvar alterações da composição">
             Salvar
           </button>
           <button
             className="rounded-lg border bg-white px-4 py-2 text-sm hover:bg-slate-50 disabled:opacity-60"
             type="button"
             onClick={criarNovaComposicao}
             disabled={loading || primitiveLoading}
             title="Cria uma nova composição (novo código) e abre para edição. Não substitui nem apaga a atual automaticamente."
           >
             Nova composição
           </button>
          <button
            className="rounded-lg border bg-white px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-60"
            type="button"
            onClick={() => exportarCsvItens(itens, `composicao_servico_${codigoServico || "servico"}.csv`)}
            disabled={loading}
            title="Exportar CSV"
          >
            <FileSpreadsheet className="h-4 w-4" />
          </button>
          <button
            className="rounded-lg border bg-white px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-60"
            type="button"
            onClick={() =>
              imprimirComposicao(
                `Composição do serviço ${codigoServico || ""}`,
                [
                  { label: "Composições", itens: itensComposicoes.map((x) => x.r), bg: displayPrefs.bgComposicoes },
                  { label: "Insumos", itens: itensInsumos.map((x) => x.r), bg: displayPrefs.bgMateriais },
                ],
                {
                  totalInsumosBase,
                  totalComposicoesBase,
                  totalMaoBase,
                  totalBase,
                  lsPercent,
                  totalComLS,
                  bdiPercent,
                  totalComLSComBDI,
                }
              )
            }
            disabled={loading}
            title="Imprimir"
          >
            <Printer className="h-4 w-4" />
          </button>
          <button
            className="rounded-lg border bg-white px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-60"
            type="button"
            onClick={() => setShowPrintConfig((v) => !v)}
            disabled={loading}
            title="Configurar impressão"
          >
            <Image className="h-4 w-4" />
          </button>
         </div>
       </div>
 
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
        <div>Atenção: alterações aqui são compartilhadas.</div>
        <div>Se você alterar Serviço/Insumo/Composição da Fonte, muda em TODAS as planilhas que usam essa Fonte.</div>
        <div>Se você alterar um Parâmetro, muda em TODAS as planilhas que usam esse Parâmetro.</div>
      </div>

      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex flex-wrap gap-2">
          <button className="rounded-lg border bg-white px-4 py-2 text-sm hover:bg-slate-50" type="button" onClick={baixarModeloComposicoesCsv} disabled={loading} title="Baixar um modelo de CSV para importar composição">
            Modelo CSV (composição)
          </button>
          <button
            className="rounded-lg border bg-white px-4 py-2 text-sm hover:bg-slate-50 disabled:opacity-60"
            type="button"
            onClick={() => setShowDisplayConfig((v) => !v)}
            disabled={loading}
            title="Abrir/ocultar configurações de exibição"
          >
            {showDisplayConfig ? "⯆" : "⯈"} Configurações de exibição dos itens da composição
          </button>
        </div>
        <div className="flex items-center justify-end gap-2 flex-wrap">
          <button
            className="rounded-lg border bg-white px-4 py-2 text-sm hover:bg-slate-50 disabled:opacity-60"
            type="button"
            onClick={abrirComposicaoPrimitiva}
            disabled={loading || primitiveLoading}
            title="Gerar composição primitiva (consolidado de insumos)"
          >
            Composição primitiva
          </button>
          <div className="flex items-center gap-2">
            <button
              className="rounded-lg border bg-white px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-60"
              type="button"
              disabled={loading || navIdx <= 0}
              title="Ir para o item anterior"
              onClick={() => navegarParaIndice(navIdx - 1)}
            >
              ‹
            </button>
            <div className="rounded-lg border bg-white px-3 py-2 text-sm text-slate-700">
              Item {navIdx >= 0 ? navPlanilhaServicos[navIdx]?.item || "—" : "—"}
            </div>
            <button
              className="rounded-lg border bg-white px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-60"
              type="button"
              disabled={loading || navIdx < 0 || navIdx >= navPlanilhaServicos.length - 1}
              title="Ir para o próximo item"
              onClick={() => navegarParaIndice(navIdx + 1)}
            >
              ›
            </button>
          </div>
        </div>
      </div>

      {okMsg ? <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">{okMsg}</div> : null}
      {err ? <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div> : null}

      {showDisplayConfig ? (
        <section className="rounded-xl border bg-white p-4 shadow-sm space-y-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <div className="text-lg font-semibold">Configurações de exibição dos itens da composição</div>
              <div className="text-sm text-slate-600">Ajuste colunas/cores dos itens e também as colunas da tabela Serviço.</div>
            </div>
            <button className="rounded-lg border bg-white px-4 py-2 text-sm hover:bg-slate-50" type="button" onClick={() => setShowDisplayConfig(false)} title="Ocultar configurações de exibição">
              Ocultar
            </button>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-12">
            <div className="md:col-span-7 space-y-2">
              <div className="text-sm font-semibold">Colunas</div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={displayPrefs.colTipo} onChange={(e) => setDisplayPrefs((p) => ({ ...p, colTipo: Boolean(e.target.checked) }))} />
                  <span className="text-slate-700">Tipo</span>
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={displayPrefs.colCodigo} onChange={(e) => setDisplayPrefs((p) => ({ ...p, colCodigo: Boolean(e.target.checked) }))} />
                  <span className="text-slate-700">Código</span>
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={displayPrefs.colBanco} onChange={(e) => setDisplayPrefs((p) => ({ ...p, colBanco: Boolean(e.target.checked) }))} />
                  <span className="text-slate-700">Banco</span>
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={displayPrefs.colDescricao} onChange={(e) => setDisplayPrefs((p) => ({ ...p, colDescricao: Boolean(e.target.checked) }))} />
                  <span className="text-slate-700">Descrição</span>
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={displayPrefs.colUnd} onChange={(e) => setDisplayPrefs((p) => ({ ...p, colUnd: Boolean(e.target.checked) }))} />
                  <span className="text-slate-700">UND</span>
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={displayPrefs.colQtd} onChange={(e) => setDisplayPrefs((p) => ({ ...p, colQtd: Boolean(e.target.checked) }))} />
                  <span className="text-slate-700">Qtd</span>
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={displayPrefs.colValorUnit} onChange={(e) => setDisplayPrefs((p) => ({ ...p, colValorUnit: Boolean(e.target.checked) }))} />
                  <span className="text-slate-700">Valor unit</span>
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={displayPrefs.colTotal} onChange={(e) => setDisplayPrefs((p) => ({ ...p, colTotal: Boolean(e.target.checked) }))} />
                  <span className="text-slate-700">Total</span>
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={displayPrefs.colCentroCusto} onChange={(e) => setDisplayPrefs((p) => ({ ...p, colCentroCusto: Boolean(e.target.checked) }))} />
                  <span className="text-slate-700">Centro de custo</span>
                </label>
              </div>
            </div>

            <div className="md:col-span-5 space-y-2">
              <div className="text-sm font-semibold">Cores de fundo</div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <label className="flex items-center justify-between gap-2 text-sm rounded border bg-white px-3 py-2">
                  <span className="text-slate-700">Composições</span>
                  <input type="color" value={displayPrefs.bgComposicoes} onChange={(e) => setDisplayPrefs((p) => ({ ...p, bgComposicoes: e.target.value }))} />
                </label>
                <label className="flex items-center justify-between gap-2 text-sm rounded border bg-white px-3 py-2">
                  <span className="text-slate-700">Material</span>
                  <input type="color" value={displayPrefs.bgMateriais} onChange={(e) => setDisplayPrefs((p) => ({ ...p, bgMateriais: e.target.value }))} />
                </label>
                <label className="flex items-center justify-between gap-2 text-sm rounded border bg-white px-3 py-2">
                  <span className="text-slate-700">Equipamento</span>
                  <input type="color" value={displayPrefs.bgEquipamentos} onChange={(e) => setDisplayPrefs((p) => ({ ...p, bgEquipamentos: e.target.value }))} />
                </label>
                <label className="flex items-center justify-between gap-2 text-sm rounded border bg-white px-3 py-2">
                  <span className="text-slate-700">Mão de obra</span>
                  <input type="color" value={displayPrefs.bgMao} onChange={(e) => setDisplayPrefs((p) => ({ ...p, bgMao: e.target.value }))} />
                </label>
              </div>
            </div>
          </div>

          <div className="rounded-lg border bg-slate-50 p-3">
            <div className="text-sm font-semibold text-slate-800">Configurações de exibição das colunas serviço</div>
            <div className="mt-2 flex flex-wrap items-center gap-4 text-sm text-slate-700">
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={servicoDisplayPrefs.colFonte} onChange={(e) => setServicoDisplayPrefs((p) => ({ ...p, colFonte: Boolean(e.target.checked) }))} />
                <span>Fonte</span>
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={servicoDisplayPrefs.colUnd} onChange={(e) => setServicoDisplayPrefs((p) => ({ ...p, colUnd: Boolean(e.target.checked) }))} />
                <span>UND</span>
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={servicoDisplayPrefs.colValorUnit} onChange={(e) => setServicoDisplayPrefs((p) => ({ ...p, colValorUnit: Boolean(e.target.checked) }))} />
                <span>Valor unit.</span>
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={servicoDisplayPrefs.colTotalSemBDI} onChange={(e) => setServicoDisplayPrefs((p) => ({ ...p, colTotalSemBDI: Boolean(e.target.checked) }))} />
                <span>Total sem BDI</span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={servicoDisplayPrefs.colTotalSemBDIComDesconto}
                  onChange={(e) => setServicoDisplayPrefs((p) => ({ ...p, colTotalSemBDIComDesconto: Boolean(e.target.checked) }))}
                  disabled={Number(descontoPercent || 0) <= 0}
                />
                <span className={Number(descontoPercent || 0) <= 0 ? "text-slate-400" : ""}>Total sem BDI com desconto</span>
              </label>
            </div>
            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {[
                { key: "wCodigoPx", label: "CÓDIGO" },
                { key: "wFontePx", label: "FONTE" },
                { key: "wServicoPx", label: "SERVIÇO" },
                { key: "wUndPx", label: "UND" },
                { key: "wValorUnitPx", label: "VALOR UNIT." },
                { key: "wTotalSemBDIPx", label: "TOTAL SEM BDI" },
                { key: "wTotalSemBDIComDescontoPx", label: "TOTAL COM DESCONTO" },
              ].map((c) => (
                <div key={c.key} className="flex items-center justify-between gap-2 rounded border bg-white px-3 py-2 text-[10px]">
                  <div className="text-slate-700 font-medium">{c.label}</div>
                  <input
                    className="input bg-white w-full max-w-[110px]"
                    type="number"
                    min={60}
                    max={1200}
                    value={(servicoDisplayPrefs as any)[c.key]}
                    onChange={(e) => {
                      const v = Number(e.target.value || 0);
                      const next = Number.isFinite(v) ? Math.max(60, Math.min(1200, Math.round(v))) : 120;
                      setServicoDisplayPrefs((p) => ({ ...(p as any), [c.key]: next }));
                    }}
                  />
                </div>
              ))}
              <div className="flex items-center justify-between gap-2 rounded border bg-white px-3 py-2 text-[10px]">
                <div className="text-slate-700 font-medium">FONTE (px)</div>
                <input
                  className="input bg-white w-full max-w-[110px]"
                  type="number"
                  min={10}
                  max={16}
                  value={servicoDisplayPrefs.fsPx}
                  onChange={(e) => setServicoDisplayPrefs((p) => ({ ...p, fsPx: Math.max(10, Math.min(16, Number(e.target.value || 13))) }))}
                />
              </div>
            </div>
          </div>

          <div className="rounded-lg border bg-slate-50 p-3">
            <div className="text-sm font-semibold text-slate-800">Largura e fonte dos itens (px)</div>
            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3 lg:grid-cols-5">
              {[
                { key: "tipo", label: "Tipo", wKey: "wTipoPx", fsKey: "fsTipoPx" },
                { key: "codigo", label: "Código", wKey: "wCodigoPx", fsKey: "fsCodigoPx" },
                { key: "banco", label: "Banco", wKey: "wBancoPx", fsKey: "fsBancoPx" },
                { key: "descricao", label: "Descrição", wKey: "wDescricaoPx", fsKey: "fsDescricaoPx" },
                { key: "und", label: "UND", wKey: "wUndPx", fsKey: "fsUndPx" },
                { key: "qtd", label: "Qtd", wKey: "wQtdPx", fsKey: "fsQtdPx" },
                { key: "valorUnit", label: "Valor Unit", wKey: "wValorUnitPx", fsKey: "fsValorUnitPx" },
                { key: "total", label: "Total", wKey: "wTotalPx", fsKey: "fsTotalPx" },
                { key: "cc", label: "C. de Custos", wKey: "wCentroCustoPx", fsKey: "fsCentroCustoPx" },
                { key: "acoes", label: "Ações", wKey: "wAcoesPx", fsKey: "fsAcoesPx" },
              ].map((c) => (
                <div key={c.key} className="flex items-center justify-between gap-2 rounded border bg-white px-3 py-2 text-[10px]">
                  <div className="min-w-[70px] text-slate-700 font-medium">{c.label}</div>
                  <div className="flex flex-1 flex-wrap items-center justify-end gap-2 min-w-0">
                    <input
                      className="input bg-white w-[88px] h-7 text-[10px]"
                      type="number"
                      min={40}
                      max={1200}
                      value={(displayPrefs as any)[c.wKey]}
                      onChange={(e) => {
                        const v = Number(e.target.value || 0);
                        const next = Number.isFinite(v) ? Math.max(40, Math.min(1200, Math.round(v))) : 40;
                        setDisplayPrefs((p) => ({ ...(p as any), [c.wKey]: next }));
                      }}
                      title="Largura (px)"
                    />
                    <input
                      className="input bg-white w-[64px] h-7 text-[10px]"
                      type="number"
                      min={10}
                      max={16}
                      value={(displayPrefs as any)[c.fsKey]}
                      onChange={(e) => {
                        const v = Number(e.target.value || 0);
                        const next = Number.isFinite(v) ? Math.max(10, Math.min(16, Math.round(v))) : 13;
                        setDisplayPrefs((p) => ({ ...(p as any), [c.fsKey]: next }));
                      }}
                      title="Fonte (px)"
                    />
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-2 text-xs text-slate-500">As configurações são salvas automaticamente neste navegador.</div>
          </div>
        </section>
      ) : null}

      {showPrintConfig ? (
        <section className="rounded-xl border bg-white p-4 shadow-sm space-y-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <div className="text-lg font-semibold">Configurar impressão</div>
              <div className="text-sm text-slate-600">Ajusta fonte do cabeçalho e espaçamento do topo na impressão desta tela.</div>
            </div>
            <button className="rounded-lg border bg-white px-4 py-2 text-sm hover:bg-slate-50" type="button" onClick={() => setShowPrintConfig(false)} title="Ocultar configurações de impressão">
              Ocultar
            </button>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-12">
            <div className="md:col-span-12">
              <label className="flex items-center gap-2 text-sm rounded border bg-white px-3 py-2">
                <input
                  type="checkbox"
                  checked={printPrefs.includeEmpresaHeader}
                  onChange={(e) => setPrintPrefs((p) => ({ ...p, includeEmpresaHeader: Boolean(e.target.checked) }))}
                />
                <span className="text-slate-700">Incluir cabeçalho padronizado da empresa na impressão</span>
              </label>
            </div>
            <div className="md:col-span-5 space-y-1">
              <div className="text-sm text-slate-600">Fonte</div>
              <select className="input bg-white" value={printPrefs.headerFontFamily} onChange={(e) => setPrintPrefs((p) => ({ ...p, headerFontFamily: e.target.value }))}>
                <option value="Arial">Arial</option>
                <option value="Calibri">Calibri</option>
                <option value="Verdana">Verdana</option>
                <option value="Times New Roman">Times New Roman</option>
              </select>
            </div>
            <div className="md:col-span-3 space-y-1">
              <div className="text-sm text-slate-600">Tamanho</div>
              <input
                className="input bg-white"
                type="number"
                min={8}
                max={16}
                value={printPrefs.headerFontSizePx}
                onChange={(e) => setPrintPrefs((p) => ({ ...p, headerFontSizePx: Math.max(8, Math.min(16, Number(e.target.value || 11))) }))}
              />
            </div>
            <div className="md:col-span-4 space-y-1">
              <div className="text-sm text-slate-600">Peso</div>
              <select className="input bg-white" value={printPrefs.headerFontWeight} onChange={(e) => setPrintPrefs((p) => ({ ...p, headerFontWeight: e.target.value as any }))}>
                <option value="normal">Normal</option>
                <option value="semibold">Semibold</option>
                <option value="bold">Bold</option>
              </select>
            </div>
            <div className="md:col-span-4 space-y-1">
              <div className="text-sm text-slate-600">Topo → cabeçalho (px)</div>
              <input
                className="input bg-white"
                type="number"
                min={0}
                max={80}
                value={printPrefs.topToHeaderPx}
                onChange={(e) => setPrintPrefs((p) => ({ ...p, topToHeaderPx: Math.max(0, Math.min(80, Number(e.target.value || 0))) }))}
              />
            </div>
          </div>
        </section>
      ) : null}

      {primitiveOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-5xl max-h-[85vh] overflow-hidden rounded-xl border bg-white p-4 shadow-sm space-y-3">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <div className="text-lg font-semibold">Composição primitiva — {codigoServico}</div>
                <div className="text-sm text-slate-700">
                  {(() => {
                    const nome = String(primitiveMeta?.descricaoServico || previstoRows?.[0]?.servicos || "").trim();
                    const und = String(primitiveMeta?.undServico || previstoRows?.[0]?.und || "").trim();
                    const parts = [];
                    if (nome) parts.push(nome);
                    if (und) parts.push(`un: ${und}`);
                    return parts.length ? parts.join(" • ") : "";
                  })()}
                </div>
                <div className="text-sm text-slate-600">Consolida insumos (inclui insumos das composições auxiliares), somando quantitativos.</div>
                {primitiveMeta?.updatedAt ? (
                  <div className="text-xs text-slate-500">Atualizado em: {formatDateTimePtBR(primitiveMeta.updatedAt)}</div>
                ) : null}
              </div>
              <div className="flex items-center gap-2">
                <button
                  className="rounded-lg border bg-white px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-60"
                  type="button"
                  onClick={() => atualizarComposicaoPrimitiva()}
                  disabled={primitiveLoading}
                  title="Atualizar (recalcular e salvar)"
                >
                  Atualizar
                </button>
                <button
                  className="rounded-lg border bg-white px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-60"
                  type="button"
                  onClick={() =>
                    imprimirComposicao(`Composição primitiva — ${codigoServico}`, [
                      {
                        label: "Insumos consolidados",
                        itens: primitiveRows.map((r, i) => ({
                          idItemBase: i + 1,
                          etapa: "",
                          tipoItem: r.tipoItem,
                          codigoItem: r.codigoItem,
                          banco: r.banco,
                          descricao: r.descricao,
                          und: r.und,
                          quantidade: String(r.quantidade),
                          valorUnitario: String(r.valorUnitario),
                          perdaPercentual: "",
                          codigoCentroCusto: "",
                          codigoCentroCustoBase: "",
                        })),
                        bg: "#FFFFFF",
                      },
                    ])
                  }
                  disabled={primitiveLoading || !primitiveRows.length}
                  title="Imprimir"
                >
                  <Printer className="h-4 w-4" />
                </button>
                <button
                  className="rounded-lg border bg-white px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-60"
                  type="button"
                  onClick={() =>
                    exportarCsvItens(
                      primitiveRows.map((r, i) => ({
                        idItemBase: i + 1,
                        etapa: "",
                        tipoItem: r.tipoItem,
                        codigoItem: r.codigoItem,
                        banco: r.banco,
                        descricao: r.descricao,
                        und: r.und,
                        quantidade: String(r.quantidade),
                        valorUnitario: String(r.valorUnitario),
                        perdaPercentual: "",
                        codigoCentroCusto: "",
                        codigoCentroCustoBase: "",
                      })),
                      `composicao_primitiva_${codigoServico}.csv`
                    )
                  }
                  disabled={primitiveLoading || !primitiveRows.length}
                  title="Exportar CSV"
                >
                  <FileSpreadsheet className="h-4 w-4" />
                </button>
                <button className="rounded-lg border bg-white px-3 py-2 text-sm hover:bg-slate-50" type="button" onClick={() => setPrimitiveOpen(false)} disabled={primitiveLoading} title="Fechar composição primitiva">
                  Fechar
                </button>
              </div>
            </div>

            {primitiveErr ? <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{primitiveErr}</div> : null}
            {primitiveLoading ? <div className="text-sm text-slate-600">Gerando…</div> : null}

            <div className="max-h-[60vh] overflow-auto rounded-lg border">
              <table className="min-w-[1100px] w-full text-sm">
                <thead className="bg-slate-50 text-center text-slate-700">
                  <tr>
                    <th className="px-3 py-2">Tipo</th>
                    <th className="px-3 py-2">Código</th>
                    <th className="px-3 py-2">Banco</th>
                    <th className="px-3 py-2">Descrição</th>
                    <th className="px-3 py-2">UND</th>
                    <th className="px-3 py-2">Qtd total</th>
                    <th className="px-3 py-2">Valor unit</th>
                    <th className="px-3 py-2">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {primitiveRows.map((r) => (
                    <tr key={`${r.tipoItem}__${r.codigoItem}__${r.und}__${r.valorUnitario}`} className="border-t">
                      <td className="px-3 py-2">{r.tipoItem}</td>
                      <td className="px-3 py-2">{r.codigoItem}</td>
                      <td className="px-3 py-2">{r.banco}</td>
                      <td className="px-3 py-2">{r.descricao}</td>
                      <td className="px-3 py-2">{r.und}</td>
                      <td className="px-3 py-2 text-right">{Number(r.quantidade || 0).toLocaleString("pt-BR", { minimumFractionDigits: 4, maximumFractionDigits: 6 })}</td>
                      <td className="px-3 py-2 text-right">{moeda(Number(r.valorUnitario || 0))}</td>
                      <td className="px-3 py-2 text-right">{moeda(Number(r.total || 0))}</td>
                    </tr>
                  ))}
                  {!primitiveRows.length && !primitiveLoading ? (
                    <tr>
                      <td colSpan={8} className="px-3 py-6 text-center text-slate-500">
                        Sem dados.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : null}

      {importPreview.file ? (
        <section className="rounded-xl border bg-white p-4 shadow-sm space-y-3">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <div className="text-lg font-semibold">Prévia da importação (CSV)</div>
              <div className="text-sm text-slate-600">
                Arquivo: <span className="font-medium">{importPreview.file.name}</span> • Válidas:{" "}
                <span className="font-medium">{importPreview.rows.filter((r) => !Object.keys(r.errors || {}).length).length}</span> • Com erros:{" "}
                <span className="font-medium">{importPreview.rows.filter((r) => Object.keys(r.errors || {}).length).length}</span>
              </div>
              {importPreview.rows.some((r) => Object.keys(r.errors || {}).length) ? (
                <div className="mt-2 text-xs text-slate-500">Linhas com erro não serão importadas. Ajuste o CSV se precisar.</div>
              ) : null}
            </div>
            <div className="flex items-center gap-2">
              <button
                className="rounded-lg border bg-white px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-60"
                type="button"
                onClick={() => setImportPreview({ file: null, rows: [] })}
                disabled={loading}
                title="Cancelar prévia"
              >
                Cancelar
              </button>
              <button
                className="rounded-lg bg-blue-600 px-3 py-2 text-sm text-white hover:bg-blue-500 disabled:opacity-60"
                type="button"
                onClick={() => {
                  const incomingCount = importPreview.rows.filter((r) => !Object.keys(r.errors || {}).length).length;
                  const existingCount = itens.filter((i) => String(i.codigoItem || "").trim()).length;
                  if (existingCount > 0) {
                    setImportChoiceInfo({ existingCount, incomingCount });
                    setImportChoiceOpen(true);
                    return;
                  }
                  confirmarImportacao("REPLACE");
                }}
                disabled={loading || !importPreview.rows.filter((r) => !Object.keys(r.errors || {}).length).length}
                title="Confirmar importação do CSV"
              >
                Confirmar importação
              </button>
            </div>
          </div>

          <div className="overflow-auto rounded-lg border">
            <table className="min-w-[1100px] w-full text-sm">
              <thead className="bg-slate-50 text-center text-slate-700">
                <tr>
                  <th className="px-3 py-2">Linha</th>
                  <th className="px-3 py-2">Etapa</th>
                  <th className="px-3 py-2">Tipo</th>
                  <th className="px-3 py-2">Código</th>
                  <th className="px-3 py-2">Banco</th>
                  <th className="px-3 py-2">Descrição</th>
                  <th className="px-3 py-2">UND</th>
                  <th className="px-3 py-2">Qtd</th>
                  <th className="px-3 py-2">Valor Unit</th>
                  <th className="px-3 py-2">CC</th>
                </tr>
              </thead>
              <tbody>
                {importPreview.rows.slice(0, 200).map((r) => {
                  const cell = (k: keyof typeof r.errors) => (r.errors?.[k] ? "bg-red-50 text-red-700" : "");
                  return (
                    <tr key={r.rowIndex} className="border-t">
                      <td className="px-3 py-2 text-xs text-slate-500">{r.rowIndex + 2}</td>
                      <td className="px-3 py-2">{r.etapa || "—"}</td>
                      <td className={`px-3 py-2 ${cell("tipoItem")}`}>{r.tipoItem || "—"}</td>
                      <td className={`px-3 py-2 ${cell("codigoItem")}`}>{r.codigoItem || "—"}</td>
                      <td className="px-3 py-2">{r.banco || "—"}</td>
                      <td className={`px-3 py-2 ${cell("descricao")}`}>{r.descricao || "—"}</td>
                      <td className={`px-3 py-2 ${cell("und")}`}>{r.und || "—"}</td>
                      <td className={`px-3 py-2 text-right ${cell("quantidade")}`}>{r.quantidade || "—"}</td>
                      <td className="px-3 py-2 text-right">{r.valorUnitario || "—"}</td>
                      <td className="px-3 py-2">{r.codigoCentroCusto || "—"}</td>
                    </tr>
                  );
                })}
                {importPreview.rows.length > 200 ? (
                  <tr className="border-t">
                    <td colSpan={10} className="px-3 py-3 text-xs text-slate-500">
                      Mostrando as primeiras 200 linhas. Total no arquivo: {importPreview.rows.length}.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {importChoiceOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-xl rounded-xl border bg-white p-4 shadow-sm space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-lg font-semibold">Este serviço já tem composição cadastrada</div>
                <div className="text-sm text-slate-600">
                  Atual: <span className="font-medium">{importChoiceInfo?.existingCount ?? itens.length}</span> itens • CSV:{" "}
                  <span className="font-medium">{importChoiceInfo?.incomingCount ?? 0}</span> itens válidos
                </div>
              </div>
              <button className="rounded border bg-white px-3 py-2 text-sm hover:bg-slate-50" type="button" onClick={() => setImportChoiceOpen(false)} disabled={loading} title="Fechar opções de importação">
                Fechar
              </button>
            </div>

            <div className="text-sm text-slate-700">Como você quer importar?</div>

            <div className="flex flex-wrap gap-2 justify-end">
              <button
                className="rounded-lg border bg-white px-4 py-2 text-sm hover:bg-slate-50 disabled:opacity-60"
                type="button"
                onClick={() => confirmarImportacao("MERGE")}
                disabled={loading}
                title="Mesclar: soma as quantidades quando a linha já existe"
              >
                Mesclar (somar)
              </button>
              <button
                className="rounded-lg bg-red-600 px-4 py-2 text-sm text-white hover:bg-red-500 disabled:opacity-60"
                type="button"
                onClick={() => confirmarImportacao("REPLACE")}
                disabled={loading}
                title="Substituir: apaga a composição atual e importa apenas o CSV"
              >
                Apagar e importar
              </button>
            </div>
          </div>
        </div>
      ) : null}
 
      <section className="rounded-xl border bg-white p-4 shadow-sm space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <div className="text-lg font-semibold">{previstoPlanilhaTitle}</div>
          </div>
        </div>
        {previstoAlert ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{previstoAlert}</div>
        ) : null}

        <div className="overflow-auto">
          <table className="min-w-[1050px] w-full text-sm border border-slate-200" style={{ fontSize: `${servicoDisplayPrefs.fsPx}px` }}>
            <thead className="bg-slate-50 text-center text-slate-700">
              <tr>
                <th className="px-3 py-2 border-r border-slate-200" style={{ width: `${servicoDisplayPrefs.wCodigoPx}px` }}>
                  CÓDIGO
                </th>
                {servicoDisplayPrefs.colFonte ? (
                  <th className="px-3 py-2 border-r border-slate-200" style={{ width: `${servicoDisplayPrefs.wFontePx}px` }}>
                    FONTE
                  </th>
                ) : null}
                <th className="px-3 py-2 border-r border-slate-200" style={{ width: `${servicoDisplayPrefs.wServicoPx}px` }}>
                  SERVIÇO
                </th>
                {servicoDisplayPrefs.colUnd ? (
                  <th className="px-3 py-2 border-r border-slate-200" style={{ width: `${servicoDisplayPrefs.wUndPx}px` }}>
                    UND
                  </th>
                ) : null}
                {servicoDisplayPrefs.colValorUnit ? (
                  <th className="px-3 py-2 border-r border-slate-200" style={{ width: `${servicoDisplayPrefs.wValorUnitPx}px` }}>
                    VALOR UNIT.
                  </th>
                ) : null}
                {servicoDisplayPrefs.colTotalSemBDI ? (
                  <th className="px-3 py-2 border-r border-slate-200" style={{ width: `${servicoDisplayPrefs.wTotalSemBDIPx}px` }}>
                    TOTAL SEM BDI
                  </th>
                ) : null}
                {Number(descontoPercent || 0) > 0 && servicoDisplayPrefs.colTotalSemBDIComDesconto ? (
                  <th className="px-3 py-2" style={{ width: `${servicoDisplayPrefs.wTotalSemBDIComDescontoPx}px` }}>
                    TOTAL SEM BDI COM DESCONTO
                  </th>
                ) : (
                  <th className="px-3 py-2">—</th>
                )}
              </tr>
            </thead>
            <tbody>
              <tr className="border-t">
                <td className="px-3 py-2 border-r border-slate-200 text-center font-semibold" style={{ width: `${servicoDisplayPrefs.wCodigoPx}px` }}>
                  {codigoServico || "—"}
                </td>

                {servicoDisplayPrefs.colFonte ? (
                  <td className="px-3 py-2 border-r border-slate-200 text-center" style={{ width: `${servicoDisplayPrefs.wFontePx}px` }}>
                    <div className="relative" ref={fonteDropdownRef}>
                      <input
                        className="input bg-white w-full text-center"
                        value={previstoServicoMeta?.fonte || ""}
                        onChange={(e) => {
                          const val = e.target.value;
                          setPrevistoServicoMeta((p: any) => ({ ...p, fonte: val }));
                          setFonteDropdownOpen(true);
                        }}
                        onFocus={() => setFonteDropdownOpen(true)}
                        placeholder="Selecione ou digite..."
                        style={{ fontSize: `${servicoDisplayPrefs.fsPx}px` }}
                      />
                      {fonteDropdownOpen ? (
                        <div className="absolute z-10 mt-1 w-64 bg-white border rounded shadow-lg left-1/2 -translate-x-1/2 max-h-60 overflow-y-auto">
                          {bancosOptions
                            .filter((b) => b.toLowerCase().includes((previstoServicoMeta?.fonte || "").toLowerCase()))
                            .map((b) => (
                              <div key={b} className="flex items-center justify-between px-3 py-2 hover:bg-slate-50 cursor-pointer border-b last:border-0 text-sm">
                                <span
                                  className="flex-1 text-left"
                                  onClick={() => {
                                    setPrevistoServicoMeta((p: any) => ({ ...p, fonte: b }));
                                    setFonteDropdownOpen(false);
                                  }}
                                >
                                  {b}
                                </span>
                                {!bancosBase.includes(b) ? (
                                  <button
                                    type="button"
                                    className="text-red-500 hover:text-red-700 ml-2"
                                    title="Excluir banco"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      excluirBancoCustom(b);
                                    }}
                                  >
                                    <XCircle className="w-4 h-4" />
                                  </button>
                                ) : null}
                              </div>
                            ))}
                          {previstoServicoMeta?.fonte && !bancosOptions.some((b) => b.toLowerCase() === previstoServicoMeta.fonte?.toLowerCase()) ? (
                            <div
                              className="px-3 py-2 text-sm text-blue-600 hover:bg-blue-50 cursor-pointer text-left"
                              onClick={() => {
                                setBancosCustom((p) => Array.from(new Set([...p, previstoServicoMeta.fonte!])));
                                setFonteDropdownOpen(false);
                              }}
                            >
                              Criar "{previstoServicoMeta.fonte}"
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  </td>
                ) : null}

                <td className="px-3 py-2 border-r border-slate-200" style={{ width: `${servicoDisplayPrefs.wServicoPx}px` }}>
                  <div className="space-y-2">
                    <input
                      className="input bg-white w-full"
                      value={previstoServicoMeta?.descricao || ""}
                      onChange={(e) => setPrevistoServicoMeta((p: any) => ({ ...p, descricao: e.target.value }))}
                      placeholder="Nome do serviço"
                      style={{ fontSize: `${servicoDisplayPrefs.fsPx}px` }}
                    />
                    {!servicoDisplayPrefs.colFonte || !servicoDisplayPrefs.colUnd ? (
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        {!servicoDisplayPrefs.colFonte ? (
                          <div className="flex items-center gap-2">
                            <div className="text-xs text-slate-500 min-w-[46px]">Fonte</div>
                            <div className="relative flex-1" ref={fonteDropdownRef}>
                              <input
                                className="input bg-white w-full"
                                value={previstoServicoMeta?.fonte || ""}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setPrevistoServicoMeta((p: any) => ({ ...p, fonte: val }));
                                  setFonteDropdownOpen(true);
                                }}
                                onFocus={() => setFonteDropdownOpen(true)}
                                placeholder="Selecione ou digite..."
                                style={{ fontSize: `${servicoDisplayPrefs.fsPx}px` }}
                              />
                              {fonteDropdownOpen ? (
                                <div className="absolute z-10 mt-1 w-64 bg-white border rounded shadow-lg left-0 max-h-60 overflow-y-auto">
                                  {bancosOptions
                                    .filter((b) => b.toLowerCase().includes((previstoServicoMeta?.fonte || "").toLowerCase()))
                                    .map((b) => (
                                      <div key={b} className="flex items-center justify-between px-3 py-2 hover:bg-slate-50 cursor-pointer border-b last:border-0 text-sm">
                                        <span
                                          className="flex-1 text-left"
                                          onClick={() => {
                                            setPrevistoServicoMeta((p: any) => ({ ...p, fonte: b }));
                                            setFonteDropdownOpen(false);
                                          }}
                                        >
                                          {b}
                                        </span>
                                        {!bancosBase.includes(b) ? (
                                          <button
                                            type="button"
                                            className="text-red-500 hover:text-red-700 ml-2"
                                            title="Excluir banco"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              excluirBancoCustom(b);
                                            }}
                                          >
                                            <XCircle className="w-4 h-4" />
                                          </button>
                                        ) : null}
                                      </div>
                                    ))}
                                  {previstoServicoMeta?.fonte && !bancosOptions.some((b) => b.toLowerCase() === previstoServicoMeta.fonte?.toLowerCase()) ? (
                                    <div
                                      className="px-3 py-2 text-sm text-blue-600 hover:bg-blue-50 cursor-pointer text-left"
                                      onClick={() => {
                                        setBancosCustom((p) => Array.from(new Set([...p, previstoServicoMeta.fonte!])));
                                        setFonteDropdownOpen(false);
                                      }}
                                    >
                                      Criar "{previstoServicoMeta.fonte}"
                                    </div>
                                  ) : null}
                                </div>
                              ) : null}
                            </div>
                          </div>
                        ) : null}
                        {!servicoDisplayPrefs.colUnd ? (
                          <div className="flex items-center gap-2">
                            <div className="text-xs text-slate-500 min-w-[46px]">UND</div>
                            <input
                              className="input bg-white w-full text-center"
                              value={previstoServicoMeta?.und || ""}
                              onChange={(e) => setPrevistoServicoMeta((p: any) => ({ ...p, und: e.target.value }))}
                              placeholder="UND"
                              style={{ fontSize: `${servicoDisplayPrefs.fsPx}px` }}
                            />
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </td>

                {servicoDisplayPrefs.colUnd ? (
                  <td className="px-3 py-2 border-r border-slate-200 text-center" style={{ width: `${servicoDisplayPrefs.wUndPx}px` }}>
                    <input
                      className="input bg-white w-full text-center"
                      value={previstoServicoMeta?.und || ""}
                      onChange={(e) => setPrevistoServicoMeta((p: any) => ({ ...p, und: e.target.value }))}
                      placeholder="UND"
                      style={{ fontSize: `${servicoDisplayPrefs.fsPx}px` }}
                    />
                  </td>
                ) : null}

                {servicoDisplayPrefs.colValorUnit ? (
                  <td className="px-3 py-2 border-r border-slate-200 text-right" style={{ width: `${servicoDisplayPrefs.wValorUnitPx}px` }}>
                    {moeda(Number(totalComLSComBDI || 0))}
                  </td>
                ) : null}

                {servicoDisplayPrefs.colTotalSemBDI ? (
                  <td className="px-3 py-2 border-r border-slate-200 text-right" style={{ width: `${servicoDisplayPrefs.wTotalSemBDIPx}px` }}>
                    {moeda(Number(totalSemBDI || 0))}
                  </td>
                ) : null}

                <td className="px-3 py-2 text-right" style={{ width: `${servicoDisplayPrefs.wTotalSemBDIComDescontoPx}px` }}>
                  {Number(descontoPercent || 0) > 0 && servicoDisplayPrefs.colTotalSemBDIComDesconto ? moeda(Number(totalSemBDIComDesconto || 0)) : "—"}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-xl border bg-white p-4 shadow-sm space-y-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex-1 min-w-[280px]">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div>
                <div className="text-lg font-semibold">Itens (composição)</div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  className="rounded-lg border bg-white px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-60"
                  type="button"
                  onClick={() => {
                    const qs = new URLSearchParams();
                    qs.set("codigo", String(codigoServico || "").trim());
                    qs.set("returnTo", getSelfUrl());
                    qs.set("from", "importar");
                    if (planilhaInfo?.idPlanilha) qs.set("planilhaId", String(planilhaInfo.idPlanilha));
                    router.push(`/dashboard/engenharia/obras/${idObra}/planilha/sinapi?${qs.toString()}`);
                  }}
                  disabled={loading}
                  title="Importar do SINAPI"
                >
                  Importar do SINAPI
                </button>
                <button
                  className="rounded-lg border bg-white px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-60"
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={loading}
                  title="Importar itens por CSV (com prévia)"
                >
                  Importar CSV
                </button>
                <button
                  className="rounded-lg border bg-white px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-60"
                  type="button"
                  onClick={() =>
                    setItens((p) => [
                      ...p,
                      {
                        idItemBase: Date.now(),
                        etapa: "",
                        tipoItem: "MATERIAL",
                        codigoItem: "",
                        banco: "",
                        descricao: "",
                        und: "",
                        quantidade: "",
                        valorUnitario: "",
                        perdaPercentual: "",
                        codigoCentroCusto: "",
                        codigoCentroCustoBase: "",
                      },
                    ])
                  }
                  disabled={loading}
                  title="Adicionar um novo item na composição"
                >
                  Adicionar item
                </button>
              </div>
            </div>
            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-lg border bg-white p-3">
                <div className="text-[11px] text-slate-500">Composições</div>
                <div className="mt-1 flex items-end justify-between gap-2">
                  <div className="text-base font-semibold text-slate-900">{moeda(Number(totalComposicoesBase || 0))}</div>
                  <div className="text-[11px] text-slate-500">
                    {totalBase > 0 ? `${((Number(totalComposicoesBase || 0) / Number(totalBase || 1)) * 100).toFixed(2)}%` : "—"}
                  </div>
                </div>
              </div>
              <div className="rounded-lg border bg-white p-3">
                <div className="text-[11px] text-slate-500">Materiais</div>
                <div className="mt-1 flex items-end justify-between gap-2">
                  <div className="text-base font-semibold text-slate-900">{moeda(Number(totalMateriaisBase || 0))}</div>
                  <div className="text-[11px] text-slate-500">
                    {totalBase > 0 ? `${((Number(totalMateriaisBase || 0) / Number(totalBase || 1)) * 100).toFixed(2)}%` : "—"}
                  </div>
                </div>
              </div>
              <div className="rounded-lg border bg-white p-3">
                <div className="text-[11px] text-slate-500">Equipamentos</div>
                <div className="mt-1 flex items-end justify-between gap-2">
                  <div className="text-base font-semibold text-slate-900">{moeda(Number(totalEquipamentosBase || 0))}</div>
                  <div className="text-[11px] text-slate-500">
                    {totalBase > 0 ? `${((Number(totalEquipamentosBase || 0) / Number(totalBase || 1)) * 100).toFixed(2)}%` : "—"}
                  </div>
                </div>
              </div>
              <div className="rounded-lg border bg-white p-3">
                <div className="text-[11px] text-slate-500">Mão de obra</div>
                <div className="mt-1 flex items-end justify-between gap-2">
                  <div className="text-base font-semibold text-slate-900">{moeda(Number(totalMaoBase || 0))}</div>
                  <div className="text-[11px] text-slate-500">{totalBase > 0 ? `${((Number(totalMaoBase || 0) / Number(totalBase || 1)) * 100).toFixed(2)}%` : "—"}</div>
                </div>
              </div>
            </div>

            <div className="mt-3 grid grid-cols-6 gap-2 text-xs">
              <div className="rounded-lg border bg-white px-2 py-2">
                <div className="text-[10px] text-slate-500">Subtotal</div>
                <div className="text-[13px] font-semibold text-slate-900">{moeda(Number(totalBase || 0))}</div>
              </div>
              <div className="rounded-lg border bg-white px-2 py-2">
                <div className="text-[10px] text-slate-500">LS</div>
                <div className="text-[13px] font-semibold text-slate-900">{Number(lsPercent || 0).toFixed(2)}%</div>
              </div>
              <div className="rounded-lg border border-indigo-600 bg-indigo-50 px-2 py-2">
                <div className="text-[10px] text-slate-500">Total (c/ LS)</div>
                <div className="text-[13px] font-semibold text-slate-900">{moeda(Number(totalComLS || 0))}</div>
              </div>
              <div className="rounded-lg border bg-white px-2 py-2">
                <div className="text-[10px] text-slate-500">BDI</div>
                <div className="text-[13px] font-semibold text-slate-900">{Number(bdiPercent || 0).toFixed(2)}%</div>
              </div>
              <div className="rounded-lg border bg-blue-600 px-2 py-2 text-white">
                <div className="text-[10px] opacity-90">Total final</div>
                <div className="text-[13px] font-semibold">{moeda(Number(totalComLSComBDI || 0))}</div>
              </div>
              <div className="rounded-lg border bg-white px-2 py-2">
                <div className="text-[10px] text-slate-500">{Number(descontoPercent || 0) > 0 ? `Total c/ desc. (${Number(descontoPercent || 0).toFixed(2)}%)` : "Total c/ desc."}</div>
                <div className="text-[13px] font-semibold text-slate-900">{moeda(Number(totalComDesconto || 0))}</div>
              </div>
            </div>
          </div>
          <div className="w-full md:w-[420px]">
            <div className="rounded-lg border bg-white p-3">
              {(() => {
                const p = planilhaParams;
                const hasSinapi = Boolean(
                  String(p?.ufSinapi || "").trim() ||
                    String(p?.dataBaseSinapi || "").trim() ||
                    p?.bdiServicosSinapi != null ||
                    p?.bdiDiferenciadoSinapi != null ||
                    p?.encSociaisSemDesSinapi != null ||
                    p?.descontoSinapi != null
                );
                const hasSbc = Boolean(
                  String(p?.dataBaseSbc || "").trim() ||
                    p?.bdiServicosSbc != null ||
                    p?.bdiDiferenciadoSbc != null ||
                    p?.encSociaisSemDesSbc != null ||
                    p?.descontoSbc != null
                );
                const tipoBase = hasSinapi ? "SINAPI" : hasSbc ? "SBC" : "";
                const dataBase = tipoBase === "SINAPI" ? String(p?.dataBaseSinapi || "").trim() : tipoBase === "SBC" ? String(p?.dataBaseSbc || "").trim() : "";
                const bdiServicos = tipoBase === "SINAPI" ? p?.bdiServicosSinapi : p?.bdiServicosSbc;
                const bdiDiferenciado = tipoBase === "SINAPI" ? p?.bdiDiferenciadoSinapi : p?.bdiDiferenciadoSbc;
                const encSociais = tipoBase === "SINAPI" ? p?.encSociaisSemDesSinapi : p?.encSociaisSemDesSbc;
                const desconto = tipoBase === "SINAPI" ? p?.descontoSinapi : p?.descontoSbc;

                return (
                  <div className="space-y-3">
                    <div className="text-sm font-semibold text-slate-800">Parâmetros</div>

                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <div className="rounded border bg-slate-50 px-2 py-2 text-xs">
                        <div className="text-[10px] text-slate-500">id do parâmetro</div>
                        <div className="font-semibold text-slate-900">{planilhaCtx?.idParametros ? `#${planilhaCtx.idParametros}` : "—"}</div>
                      </div>
                      <div className="rounded border bg-slate-50 px-2 py-2 text-xs">
                        <div className="text-[10px] text-slate-500">Nome</div>
                        <div className="font-semibold text-slate-900">{planilhaCtx?.parametrosNome || "—"}</div>
                      </div>
                    </div>

                    <div className="rounded border bg-slate-50 p-2">
                      <div className="text-xs font-semibold text-slate-800">1 - Usado em insumos</div>
                      <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
                        <div className="rounded border bg-white px-2 py-2 text-xs">
                          <div className="text-[10px] text-slate-500">UF</div>
                          <div className="font-semibold text-slate-900">{String(p?.ufSinapi || "").trim() ? String(p?.ufSinapi || "").trim() : "—"}</div>
                        </div>
                        <div className="rounded border bg-white px-2 py-2 text-xs">
                          <div className="text-[10px] text-slate-500">Sinapi ou SBC</div>
                          <div className="font-semibold text-slate-900">{tipoBase || "—"}</div>
                        </div>
                        <div className="rounded border bg-white px-2 py-2 text-xs">
                          <div className="text-[10px] text-slate-500">Data-base</div>
                          <div className="font-semibold text-slate-900">{dataBase || "—"}</div>
                        </div>
                      </div>
                    </div>

                    <div className="rounded border bg-slate-50 p-2">
                      <div className="text-xs font-semibold text-slate-800">2 - Usado em Composições</div>
                      <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                        <div className="rounded border bg-white px-2 py-2 text-xs">
                          <div className="text-[10px] text-slate-500">BDI de Serviços (%)</div>
                          <div className="font-semibold text-slate-900">{bdiServicos == null ? "—" : Number(bdiServicos).toFixed(2)}</div>
                        </div>
                        <div className="rounded border bg-white px-2 py-2 text-xs">
                          <div className="text-[10px] text-slate-500">BDI Diferenciado (%)</div>
                          <div className="font-semibold text-slate-900">{bdiDiferenciado == null ? "—" : Number(bdiDiferenciado).toFixed(2)}</div>
                        </div>
                        <div className="rounded border bg-white px-2 py-2 text-xs">
                          <div className="text-[10px] text-slate-500">Enc. Sociais (%)</div>
                          <div className="font-semibold text-slate-900">{encSociais == null ? "—" : Number(encSociais).toFixed(2)}</div>
                        </div>
                        <div className="rounded border bg-white px-2 py-2 text-xs">
                          <div className="text-[10px] text-slate-500">Desconto (%)</div>
                          <div className="font-semibold text-slate-900">{desconto == null ? "—" : Number(desconto).toFixed(2)}</div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        </div>

        <div className="space-y-4">
          {renderItensTabela(itensFiltradosOrdenados, (r) => {
            const cat = categoriaItem(r);
            if (cat === "composicoes") return displayPrefs.bgComposicoes;
            if (cat === "equipamentos") return displayPrefs.bgEquipamentos;
            if (cat === "mao_de_obra") return displayPrefs.bgMao;
            return displayPrefs.bgMateriais;
          }, { showFiltro: true })}
        </div>
      </section>
     </div>
   );
 }
