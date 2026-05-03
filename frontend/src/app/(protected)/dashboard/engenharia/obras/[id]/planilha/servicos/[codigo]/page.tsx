 "use client";
 
import { useEffect, useMemo, useRef, useState } from "react";
 import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Trash2, Printer, FileSpreadsheet, Image, CheckCircle2, CircleDashed, XCircle, Layers, Package, Wrench, HardHat } from "lucide-react";
 
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
 
type CentroCustoOption = { codigo: string; descricao: string };

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
   const s = String(v || "").trim();
   if (!s) return null;
   const norm = s.replace(/\./g, "").replace(",", ".").replace(/[^\d.\-]/g, "");
   const n = Number(norm);
   return Number.isFinite(n) ? n : null;
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
  const [returnToMem, setReturnToMem] = useState<string | null>(null);
 
   const [loading, setLoading] = useState(false);
   const [err, setErr] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
   const [itens, setItens] = useState<ItemRow[]>([]);
  const [centrosCusto, setCentrosCusto] = useState<CentroCustoOption[]>([]);
  const [previstoRows, setPrevistoRows] = useState<PrevistoPlanilhaRow[]>([]);
  const [navPlanilhaServicos, setNavPlanilhaServicos] = useState<Array<{ item: string; codigo: string; servicos: string }>>([]);
  const [navIdx, setNavIdx] = useState<number>(-1);
  const [planilhaParams, setPlanilhaParams] = useState<PlanilhaParams | null>(null);
  const [planilhaInfo, setPlanilhaInfo] = useState<{ idPlanilha: number; numeroVersao: number; dataBaseSinapi: string | null; ufSinapi: string | null } | null>(null);
  const [definedComposicoesCodes, setDefinedComposicoesCodes] = useState<Set<string>>(new Set());
  const [empresaDocumentosLayout, setEmpresaDocumentosLayout] = useState<EmpresaDocumentosLayout | null>(null);
  const [bancosCustom, setBancosCustom] = useState<string[]>([]);
  const [editingBancoOutroIdx, setEditingBancoOutroIdx] = useState<number | null>(null);
  const [bancoOutroValue, setBancoOutroValue] = useState("");
  const [editingCentroCustoIdx, setEditingCentroCustoIdx] = useState<number | null>(null);
  const [showDisplayConfig, setShowDisplayConfig] = useState(false);
  const [showPrintConfig, setShowPrintConfig] = useState(false);
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
       const res = await authFetch(`/api/v1/engenharia/obras/${idObra}/planilha/servicos/${encodeURIComponent(codigoServico)}/composicao-itens`);
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
      sincronizarValoresComposicoes(mapped);
      if (!silent) setOkMsg("Composição carregada.");
     } catch (e: any) {
       setErr(e?.message || "Erro ao carregar composição");
       setItens([]);
     } finally {
       setLoading(false);
     }
   }
 
   async function salvar() {
     if (!idObra || !codigoServico) return;
     try {
       setLoading(true);
       setErr(null);
      setOkMsg(null);
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
 
       const res = await authFetch(`/api/v1/engenharia/obras/${idObra}/planilha/servicos/${encodeURIComponent(codigoServico)}/composicao-itens`, {
         method: "PUT",
         headers: { "Content-Type": "application/json" },
         body: JSON.stringify({ itens: payload }),
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
      const res = await authFetch(`/api/v1/engenharia/obras/${idObra}/planilha/servicos/${encodeURIComponent(codigoServico)}/composicao-itens`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itens: payload }),
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

  async function carregarCentrosCusto() {
    try {
      const res = await authFetch(`/api/v1/engenharia/centros-custo?ativo=1`);
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        setCentrosCusto([]);
        return;
      }
      const lista = Array.isArray(json.data) ? json.data : [];
      setCentrosCusto(lista.map((c: any) => ({ codigo: String(c.codigo), descricao: String(c.descricao || "") })));
    } catch {
      setCentrosCusto([]);
    }
  }

  async function carregarPrevistoPlanilha() {
    if (!idObra || !codigoServico) return;
    try {
      const resV = await authFetch(`/api/v1/engenharia/obras/${idObra}/planilha?view=versoes`);
      const jsonV = await resV.json().catch(() => null);
      if (!resV.ok || !jsonV?.success) throw new Error(jsonV?.message || "Erro ao carregar versões");
      const versoes = Array.isArray(jsonV.data?.versoes) ? jsonV.data.versoes : [];
      const atual = versoes.find((v: any) => Boolean(v.atual)) || versoes[0] || null;
      const planilhaId = atual?.idPlanilha != null ? Number(atual.idPlanilha) : 0;
      if (!planilhaId) {
        setPrevistoRows([]);
        return;
      }

      const res = await authFetch(`/api/v1/engenharia/obras/${idObra}/planilha?planilhaId=${planilhaId}`);
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.message || "Erro ao carregar planilha");
      const p = (json.data?.planilha?.parametros || {}) as any;
      const plan = json.data?.planilha || null;
      setPlanilhaInfo(
        plan
          ? {
              idPlanilha: Number(plan.idPlanilha || planilhaId),
              numeroVersao: Number(plan.numeroVersao || 0),
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
      const rows = linhas
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
      setPrevistoRows(rows);
    } catch {
      setPrevistoRows([]);
      setPlanilhaParams(null);
      setPlanilhaInfo(null);
      setNavPlanilhaServicos([]);
      setNavIdx(-1);
    }
  }

  async function carregarComposicoesDefinidas() {
    if (!idObra) return;
    try {
      const res = await authFetch(`/api/v1/engenharia/obras/${idObra}/planilha/composicoes/status`);
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
    carregarCentrosCusto();
    carregar(true);
    carregarPrevistoPlanilha();
    carregarComposicoesDefinidas();
    carregarEmpresaDocumentosLayout();
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
    if (target) {
      if (!isExternalHref(target)) router.push(target);
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

  const bancosBase = useMemo(() => ["SINAPI", "Próprio", "SBC", "SICRO3"], []);
  const bancosOptions = useMemo(() => Array.from(new Set([...bancosBase, ...bancosCustom])), [bancosBase, bancosCustom]);

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

  const totalMateriaisBase = useMemo(() => {
    let total = 0;
    for (const i of itens) {
      if (String(i.tipoItem || "").toUpperCase() !== "INSUMO") continue;
      const q = parseNumberLoose(i.quantidade);
      const v = parseNumberLoose(i.valorUnitario);
      if (q == null || v == null) continue;
      total += q * v;
    }
    return Number(total.toFixed(2));
  }, [itens]);

  const totalEquipBase = useMemo(() => {
    let total = 0;
    for (const i of itens) {
      if (String(i.tipoItem || "").toUpperCase() !== "EQUIPAMENTO") continue;
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
      const t = String(i.tipoItem || "").toUpperCase();
      if (t !== "COMPOSICAO" && t !== "COMPOSICAO_AUXILIAR") continue;
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
      if (String(i.tipoItem || "").toUpperCase() !== "MAO_DE_OBRA") continue;
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

  useEffect(() => {
    if (!itens.length) return;
    sincronizarValoresComposicoes(itens);
  }, [lsPercent]);

  async function calcularTotalComLSDeComposicao(codigo: string) {
    const code = String(codigo || "").trim().toUpperCase();
    if (!code) return null;
    const cached = compTotalCacheRef.current.get(code);
    if (cached != null) return cached;
    if (!definedComposicoesCodes.has(code)) return null;
    const res = await authFetch(`/api/v1/engenharia/obras/${idObra}/planilha/servicos/${encodeURIComponent(code)}/composicao-itens`);
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

  async function atualizarValorComposicaoNoItem(rowIdx: number, codigo: string) {
    try {
      if (!idObra) return;
      const code = String(codigo || "").trim().toUpperCase();
      if (!code) return;
      if (!definedComposicoesCodes.has(code)) return;
      const totalComLSLocal = await calcularTotalComLSDeComposicao(code);
      if (totalComLSLocal == null) return;
      setItens((p) => {
        const row = p[rowIdx];
        if (!row) return p;
        const curVu = parseNumberLoose(row.valorUnitario);
        const shouldAsk = curVu != null && Math.abs(curVu - totalComLSLocal) > 0.005;
        if (shouldAsk) {
          const ok = window.confirm(`Atualizar o valor unitário da composição "${code}" para ${moeda(totalComLSLocal)} (sem BDI)?`);
          if (!ok) return p;
        }
        return p.map((x, i) => (i === rowIdx ? { ...x, valorUnitario: totalComLSLocal.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) } : x));
      });
      setOkMsg(`Valor da composição ${code} atualizado (Total com LS, sem BDI).`);
    } catch (e: any) {
      setItens((p) => p.map((x, i) => (i === rowIdx ? { ...x, valorUnitario: "" } : x)));
      setErr(e?.message || "Erro ao atualizar valor da composição");
    }
  }

  async function sincronizarValoresComposicoes(itensBase: ItemRow[]) {
    const codes = Array.from(
      new Set(
        itensBase
          .filter((r) => ["COMPOSICAO", "COMPOSICAO_AUXILIAR"].includes(String(r.tipoItem || "").toUpperCase()))
          .map((r) => String(r.codigoItem || "").trim().toUpperCase())
          .filter(Boolean)
      )
    );
    if (!codes.length) return;
    const nextByCode = new Map<string, string>();
    for (const code of codes) {
      try {
        if (!definedComposicoesCodes.has(code)) {
          nextByCode.set(code, "");
          continue;
        }
        const totalComLSLocal = await calcularTotalComLSDeComposicao(code);
        if (totalComLSLocal == null) continue;
        nextByCode.set(code, totalComLSLocal.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
      } catch {
        nextByCode.set(code, "");
      }
    }
    setItens((p) =>
      p.map((r) => {
        const t = String(r.tipoItem || "").toUpperCase();
        if (t !== "COMPOSICAO" && t !== "COMPOSICAO_AUXILIAR") return r;
        const code = String(r.codigoItem || "").trim().toUpperCase();
        if (!code) return { ...r, valorUnitario: "" };
        if (!nextByCode.has(code)) return r;
        const vu = nextByCode.get(code) ?? "";
        return vu === r.valorUnitario ? r : { ...r, valorUnitario: vu };
      })
    );
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
  const itensComposicoes = useMemo(() => itensIdx.filter(({ r }) => ["COMPOSICAO", "COMPOSICAO_AUXILIAR"].includes(String(r.tipoItem || "").toUpperCase())), [itensIdx]);
  const itensMateriais = useMemo(() => itensIdx.filter(({ r }) => String(r.tipoItem || "").toUpperCase() === "INSUMO"), [itensIdx]);
  const itensEquip = useMemo(() => itensIdx.filter(({ r }) => String(r.tipoItem || "").toUpperCase() === "EQUIPAMENTO"), [itensIdx]);
  const itensMao = useMemo(() => itensIdx.filter(({ r }) => String(r.tipoItem || "").toUpperCase() === "MAO_DE_OBRA"), [itensIdx]);

  function tipoMeta(tipo: string) {
    const t = String(tipo || "").toUpperCase();
    if (t === "COMPOSICAO" || t === "COMPOSICAO_AUXILIAR") return { label: t === "COMPOSICAO" ? "Composição" : "Composição Auxiliar", Icon: Layers, key: t };
    if (t === "INSUMO") return { label: "Material", Icon: Package, key: t };
    if (t === "EQUIPAMENTO") return { label: "Equipamento", Icon: Wrench, key: t };
    if (t === "MAO_DE_OBRA") return { label: "Mão de obra", Icon: HardHat, key: t };
    return { label: t || "Tipo", Icon: Layers, key: t || "INSUMO" };
  }

  function nextTipo(tipo: string) {
    const order = ["COMPOSICAO", "COMPOSICAO_AUXILIAR", "INSUMO", "EQUIPAMENTO", "MAO_DE_OBRA"];
    const t = String(tipo || "").toUpperCase();
    const idx = Math.max(0, order.indexOf(t));
    return order[(idx + 1) % order.length];
  }

  function px(n: number) {
    return `${Math.max(0, Math.round(Number(n) || 0))}px`;
  }

  function renderItensTabela(list: Array<{ r: ItemRow; idx: number }>, rowBg: string) {
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
        <table className="w-full text-sm" style={{ minWidth: "1100px" }}>
          <thead className="bg-slate-50 text-center text-slate-700">
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
              const q = parseNumberLoose(r.quantidade);
              const bancoInOptions = !r.banco || bancosOptions.includes(r.banco);
              const selectBancoValue = bancoInOptions ? r.banco : "__OUTRO__";
              const meta = tipoMeta(r.tipoItem);
              const isComposicao = meta.key === "COMPOSICAO" || meta.key === "COMPOSICAO_AUXILIAR";
              const codigoComposicao = String(r.codigoItem || "").trim().toUpperCase();
              const isDefinida = Boolean(codigoComposicao) && definedComposicoesCodes.has(codigoComposicao);
              const vRaw = parseNumberLoose(r.valorUnitario);
              const v = isComposicao && !isDefinida ? null : vRaw;
              const total = q != null && v != null ? q * v : null;
              const displayValorUnit = isComposicao ? (isDefinida ? r.valorUnitario : "") : r.valorUnitario;
              return (
                <tr key={idx} className="border-t" style={{ backgroundColor: rowBg }}>
                  {displayPrefs.colTipo ? (
                    <td className="px-3 py-2" style={{ ...cellW(w.tipo), fontSize: px(fs.tipo) }}>
                      <button
                        className="rounded border bg-white p-2 hover:bg-slate-50 disabled:opacity-60"
                        type="button"
                        disabled={loading}
                        title={`Alterar tipo (atual: ${meta.label})`}
                        onClick={() => {
                          const next = nextTipo(r.tipoItem);
                          const nextLabel = tipoMeta(next).label;
                          if (!window.confirm(`Alterar tipo de "${meta.label}" para "${nextLabel}"?`)) return;
                          setItens((p) => p.map((x, i) => (i === idx ? { ...x, tipoItem: next } : x)));
                        }}
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
                          onBlur={() => {
                            const isComp = isComposicao;
                            const code = String(r.codigoItem || "").trim().toUpperCase();
                            if (isComp && code) atualizarValorComposicaoNoItem(idx, code);
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
                              router.push(
                                `/dashboard/engenharia/obras/${idObra}/planilha/servicos/${encodeURIComponent(codigoComposicao)}?returnTo=${encodeURIComponent(
                                  `/dashboard/engenharia/obras/${idObra}/planilha/servicos/${encodeURIComponent(codigoServico)}`
                                )}`
                              )
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
                        onChange={(e) => {
                          const v = e.target.value;
                          if (v === "__OUTRO__") {
                            setEditingBancoOutroIdx(idx);
                            setBancoOutroValue("");
                            setItens((p) => p.map((x, i) => (i === idx ? { ...x, banco: "" } : x)));
                            return;
                          }
                          setEditingBancoOutroIdx((cur) => (cur === idx ? null : cur));
                          setItens((p) => p.map((x, i) => (i === idx ? { ...x, banco: v } : x)));
                        }}
                      >
                        <option value="">(sem banco)</option>
                        {bancosOptions.map((b) => (
                          <option key={b} value={b}>
                            {b}
                          </option>
                        ))}
                        <option value="__OUTRO__">Outro…</option>
                      </select>
                      {editingBancoOutroIdx === idx ? (
                        <input
                          className="input bg-white"
                          placeholder="Digite outro banco"
                          value={bancoOutroValue}
                          onChange={(e) => setBancoOutroValue(e.target.value)}
                          onBlur={() => {
                            const v = String(bancoOutroValue || "").trim();
                            if (!v) {
                              setEditingBancoOutroIdx(null);
                              setBancoOutroValue("");
                              return;
                            }
                            setBancosCustom((p) => (p.includes(v) ? p : [...p, v]));
                            setItens((p) => p.map((x, i) => (i === idx ? { ...x, banco: v } : x)));
                            setEditingBancoOutroIdx(null);
                            setBancoOutroValue("");
                          }}
                          style={{ fontSize: px(fs.banco) }}
                        />
                      ) : null}
                    </div>
                  </td>
                  ) : null}
                  {displayPrefs.colDescricao ? (
                    <td className="px-3 py-2" style={{ ...cellW(w.descricao), fontSize: px(fs.descricao) }}>
                    <input
                      className="input bg-white"
                      value={r.descricao}
                      onChange={(e) => setItens((p) => p.map((x, i) => (i === idx ? { ...x, descricao: e.target.value } : x)))}
                      style={{ fontSize: px(fs.descricao) }}
                    />
                  </td>
                  ) : null}
                  {displayPrefs.colUnd ? (
                    <td className="px-3 py-2" style={{ ...cellW(w.und), fontSize: px(fs.und) }}>
                    <input
                      className="input bg-white"
                      value={r.und}
                      onChange={(e) => setItens((p) => p.map((x, i) => (i === idx ? { ...x, und: e.target.value } : x)))}
                      style={{ ...cellW(w.und), fontSize: px(fs.und) }}
                    />
                  </td>
                  ) : null}
                  {displayPrefs.colQtd ? (
                    <td className="px-3 py-2 text-right" style={{ ...cellW(w.qtd), fontSize: px(fs.qtd) }}>
                    <input
                      className="input bg-white text-right"
                      value={r.quantidade}
                      onChange={(e) => setItens((p) => p.map((x, i) => (i === idx ? { ...x, quantidade: e.target.value } : x)))}
                      style={{ ...cellW(w.qtd), fontSize: px(fs.qtd) }}
                    />
                  </td>
                  ) : null}
                  {displayPrefs.colValorUnit ? (
                    <td className="px-3 py-2 text-right" style={{ ...cellW(w.valorUnit), fontSize: px(fs.valorUnit) }}>
                    {isComposicao ? (
                      <div className="flex items-center gap-2">
                        <input
                          className="input bg-white text-right flex-1 min-w-0 disabled:opacity-70"
                          value={displayValorUnit}
                          disabled
                          title={
                            !codigoComposicao
                              ? "Informe o código da composição para calcular o valor unitário (Total com LS, sem BDI)"
                              : isDefinida
                                ? "Valor unitário calculado da composição (Total com LS, sem BDI)"
                                : "Composição não definida. Defina a composição para calcular o valor unitário (sem BDI)"
                          }
                          style={{ fontSize: px(fs.valorUnit) }}
                        />
                        <button
                          className="rounded border bg-white p-2 hover:bg-slate-50 disabled:opacity-60"
                          type="button"
                          disabled={loading || !codigoComposicao || !isDefinida}
                          title="Atualizar valor unitário pela composição (Total com LS, sem BDI)"
                          onClick={() => atualizarValorComposicaoNoItem(idx, codigoComposicao)}
                        >
                          ↻
                        </button>
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
                      {total == null ? "" : moeda(Number(total))}
                    </td>
                  ) : null}
                  {displayPrefs.colCentroCusto ? (
                    <td className="px-3 py-2" style={{ ...cellW(w.cc), fontSize: px(fs.cc) }}>
                    {editingCentroCustoIdx === idx ? (
                      <select
                        className="input bg-white"
                        autoFocus
                        value={r.codigoCentroCusto}
                        onChange={(e) => {
                          setItens((p) => p.map((x, i) => (i === idx ? { ...x, codigoCentroCusto: e.target.value } : x)));
                          setEditingCentroCustoIdx(null);
                        }}
                        onBlur={() => setEditingCentroCustoIdx(null)}
                        style={{ ...cellW(w.cc), fontSize: px(fs.cc) }}
                      >
                        <option value="">(sem CC)</option>
                        {centrosCusto.map((c) => (
                          <option key={c.codigo} value={c.codigo}>
                            {c.codigo} — {c.descricao}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <button
                        className="rounded border bg-white p-2 hover:bg-slate-50 disabled:opacity-60"
                        type="button"
                        disabled={loading || !centrosCusto.length}
                        title={
                          !centrosCusto.length
                            ? "Sem centros de custo cadastrados"
                            : r.codigoCentroCusto
                              ? `Centro de custo: ${r.codigoCentroCusto} (clique para alterar)`
                              : "Definir centro de custo"
                        }
                        onClick={() => setEditingCentroCustoIdx(idx)}
                        style={{ fontSize: px(fs.cc) }}
                      >
                        {r.codigoCentroCusto ? <CheckCircle2 className="h-4 w-4 text-green-700" /> : <CircleDashed className="h-4 w-4 text-slate-500" />}
                      </button>
                    )}
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
      totalMateriaisBase: number;
      totalEquipBase: number;
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
          <div class="card"><div class="lab">Materiais</div><div class="val">${escapeHtml(moeda(Number(summary.totalMateriaisBase || 0)))}</div></div>
          <div class="card"><div class="lab">Equipamentos</div><div class="val">${escapeHtml(moeda(Number(summary.totalEquipBase || 0)))}</div></div>
          <div class="card"><div class="lab">Composições</div><div class="val">${escapeHtml(moeda(Number(summary.totalComposicoesBase || 0)))}</div></div>
          <div class="card"><div class="lab">Mão de obra (base)</div><div class="val">${escapeHtml(moeda(Number(summary.totalMaoBase || 0)))}</div></div>
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
      .cards { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
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
    setOkMsg("Impressão aberta.");
  }

  async function abrirComposicaoPrimitiva() {
    if (!idObra || !codigoServico) return;
    try {
      setPrimitiveOpen(true);
      setPrimitiveLoading(true);
      setPrimitiveErr(null);
      setPrimitiveRows([]);

      const stack = new Set<string>();
      const load = async (code: string) => {
        const res = await authFetch(`/api/v1/engenharia/obras/${idObra}/planilha/servicos/${encodeURIComponent(code)}/composicao-itens`);
        const json = await res.json().catch(() => null);
        if (!res.ok || !json?.success) throw new Error(json?.message || `Erro ao carregar composição ${code}`);
        const list = Array.isArray(json.data?.itens) ? json.data.itens : [];
        return list.map((i: any) => ({
          tipoItem: String(i.tipoItem || ""),
          codigoItem: String(i.codigoItem || ""),
          banco: String(i.banco || ""),
          descricao: String(i.descricao || ""),
          und: String(i.und || ""),
          quantidade: i.quantidade == null ? "" : String(i.quantidade),
          valorUnitario: i.valorUnitario == null ? "" : String(i.valorUnitario),
        })) as Array<{ tipoItem: string; codigoItem: string; banco: string; descricao: string; und: string; quantidade: string; valorUnitario: string }>;
      };

      const out = new Map<string, { tipoItem: string; codigoItem: string; banco: string; descricao: string; und: string; quantidade: number; valorUnitario: number }>();

      const expand = async (code: string, mult: number) => {
        const k = String(code || "").trim().toUpperCase();
        if (!k) return;
        if (stack.has(k)) return;
        stack.add(k);
        const items = await load(k);
        for (const it of items) {
          const tipo = String(it.tipoItem || "").trim().toUpperCase();
          const childCode = String(it.codigoItem || "").trim().toUpperCase();
          const q = parseNumberLoose(it.quantidade);
          const v = parseNumberLoose(it.valorUnitario);
          const qty = (q == null ? 0 : q) * mult;
          const vu = v == null ? 0 : v;

          if (tipo === "COMPOSICAO" || tipo === "COMPOSICAO_AUXILIAR") {
            if (childCode && qty > 0) await expand(childCode, qty);
            continue;
          }

          const key = [tipo, childCode, String(it.und || "").trim().toUpperCase(), String(it.banco || "").trim().toUpperCase(), String(vu)].join("|");
          const cur = out.get(key);
          if (!cur) {
            out.set(key, {
              tipoItem: tipo,
              codigoItem: childCode,
              banco: String(it.banco || ""),
              descricao: String(it.descricao || ""),
              und: String(it.und || ""),
              quantidade: qty,
              valorUnitario: vu,
            });
          } else {
            out.set(key, { ...cur, quantidade: cur.quantidade + qty });
          }
        }
        stack.delete(k);
      };

      await expand(codigoServico, 1);
      const rows = Array.from(out.values())
        .map((r) => ({
          ...r,
          quantidade: Number((r.quantidade || 0).toFixed(6)),
          total: Number(((r.quantidade || 0) * (r.valorUnitario || 0)).toFixed(2)),
        }))
        .sort((a, b) => String(a.tipoItem).localeCompare(String(b.tipoItem)) || String(a.codigoItem).localeCompare(String(b.codigoItem)));
      setPrimitiveRows(rows);
      setOkMsg("Composição primitiva gerada.");
    } catch (e: any) {
      setPrimitiveErr(e?.message || "Erro ao gerar composição primitiva");
    } finally {
      setPrimitiveLoading(false);
    }
  }

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-7xl text-slate-900">
       <div className="flex items-start justify-between gap-3 flex-wrap">
         <div>
          <div className="text-xs text-slate-500">Engenharia → Obras → Obra selecionada → Planilha orçamentária → Análise de composição</div>
          <h1 className="text-2xl font-semibold">Análise de composição — {codigoServico || "—"}</h1>
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
           <button className="rounded-lg border bg-white px-4 py-2 text-sm hover:bg-slate-50 disabled:opacity-60" type="button" onClick={() => fileInputRef.current?.click()} disabled={loading} title="Importar itens por CSV (com prévia)">
             Importar CSV
           </button>
           <button className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white disabled:opacity-60" type="button" onClick={salvar} disabled={loading} title="Salvar alterações da composição">
             Salvar
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
                  { label: "Material", itens: itensMateriais.map((x) => x.r), bg: displayPrefs.bgMateriais },
                  { label: "Equipamento", itens: itensEquip.map((x) => x.r), bg: displayPrefs.bgEquipamentos },
                  { label: "Mão de obra", itens: itensMao.map((x) => x.r), bg: displayPrefs.bgMao },
                ],
                {
                  totalMateriaisBase,
                  totalEquipBase,
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
            {showDisplayConfig ? "⯆" : "⯈"} Configurações de exibição
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
              <div className="text-lg font-semibold">Configurações de exibição</div>
              <div className="text-sm text-slate-600">Escolha quais colunas exibir e defina as cores de fundo padrão por tipo.</div>
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
            <div className="text-sm font-semibold text-slate-800">Largura e fonte (px)</div>
            <div className="mt-2 overflow-auto">
              <table className="min-w-[900px] w-full text-sm">
                <thead className="text-center text-slate-600">
                  <tr>
                    <th className="py-2 pr-3">Coluna</th>
                    <th className="py-2 pr-3">Largura</th>
                    <th className="py-2 pr-3">Fonte</th>
                  </tr>
                </thead>
                <tbody className="text-slate-700">
                  {[
                    { key: "tipo", label: "Tipo", wKey: "wTipoPx", fsKey: "fsTipoPx" },
                    { key: "codigo", label: "Código", wKey: "wCodigoPx", fsKey: "fsCodigoPx" },
                    { key: "banco", label: "Banco", wKey: "wBancoPx", fsKey: "fsBancoPx" },
                    { key: "descricao", label: "Descrição", wKey: "wDescricaoPx", fsKey: "fsDescricaoPx" },
                    { key: "und", label: "UND", wKey: "wUndPx", fsKey: "fsUndPx" },
                    { key: "qtd", label: "Qtd", wKey: "wQtdPx", fsKey: "fsQtdPx" },
                    { key: "valorUnit", label: "Valor Unit", wKey: "wValorUnitPx", fsKey: "fsValorUnitPx" },
                    { key: "total", label: "Total", wKey: "wTotalPx", fsKey: "fsTotalPx" },
                    { key: "cc", label: "Centro de custo", wKey: "wCentroCustoPx", fsKey: "fsCentroCustoPx" },
                    { key: "acoes", label: "Ações", wKey: "wAcoesPx", fsKey: "fsAcoesPx" },
                  ].map((c) => (
                    <tr key={c.key} className="border-t">
                      <td className="py-2 pr-3 font-medium">{c.label}</td>
                      <td className="py-2 pr-3">
                        <input
                          className="input bg-white w-[120px]"
                          type="number"
                          min={40}
                          max={1200}
                          value={(displayPrefs as any)[c.wKey]}
                          onChange={(e) => {
                            const v = Number(e.target.value || 0);
                            const next = Number.isFinite(v) ? Math.max(40, Math.min(1200, Math.round(v))) : 40;
                            setDisplayPrefs((p) => ({ ...(p as any), [c.wKey]: next }));
                          }}
                        />
                      </td>
                      <td className="py-2 pr-3">
                        <input
                          className="input bg-white w-[120px]"
                          type="number"
                          min={10}
                          max={16}
                          value={(displayPrefs as any)[c.fsKey]}
                          onChange={(e) => {
                            const v = Number(e.target.value || 0);
                            const next = Number.isFinite(v) ? Math.max(10, Math.min(16, Math.round(v))) : 13;
                            setDisplayPrefs((p) => ({ ...(p as any), [c.fsKey]: next }));
                          }}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
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
          <div className="w-full max-w-5xl rounded-xl border bg-white p-4 shadow-sm space-y-3">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <div className="text-lg font-semibold">Composição primitiva — {codigoServico}</div>
                <div className="text-sm text-slate-600">Consolida insumos (inclui insumos das composições auxiliares), somando quantitativos.</div>
              </div>
              <div className="flex items-center gap-2">
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

            <div className="overflow-auto rounded-lg border">
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
            <div className="text-lg font-semibold">Previsto na planilha</div>
            <div className="text-sm text-slate-600">
              {(() => {
                const nome = String(previstoRows?.[0]?.servicos || "").trim();
                return nome ? `${codigoServico} — ${nome}` : codigoServico;
              })()}
            </div>
          </div>
        </div>

        <div className="overflow-auto">
          <table className="min-w-[900px] w-full text-sm">
            <thead className="bg-slate-50 text-center text-slate-700">
              <tr>
                <th className="px-3 py-2">ITEM</th>
                <th className="px-3 py-2">SERVIÇO</th>
                <th className="px-3 py-2">UND</th>
                <th className="px-3 py-2">QUANT.</th>
                <th className="px-3 py-2">VALOR UNIT.</th>
                <th className="px-3 py-2">TOTAL</th>
                <th className="px-3 py-2">{Number(descontoPercent || 0) > 0 ? "TOTAL COM DESCONTO" : "TOTAL FINAL (LS + BDI)"}</th>
                <th className="px-3 py-2">DIFERENÇA</th>
              </tr>
            </thead>
            <tbody>
              {previstoRows.map((r, idx) => (
                <tr key={`${r.item}-${idx}`} className="border-t">
                  <td className="px-3 py-2">{r.item}</td>
                  <td className="px-3 py-2">{r.servicos}</td>
                  <td className="px-3 py-2">{r.und}</td>
                  <td className="px-3 py-2 text-right">
                    {(() => {
                      const n = parseNumberLoose(r.quant);
                      return n == null ? r.quant : n.toLocaleString("pt-BR", { minimumFractionDigits: 3, maximumFractionDigits: 3 });
                    })()}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {(() => {
                      const n = parseNumberLoose(r.valorUnitario);
                      return n == null ? r.valorUnitario : n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                    })()}
                  </td>
                  <td className="px-3 py-2 text-right">{r.valorParcial ? moeda(Number(parseNumberLoose(r.valorParcial) || 0)) : ""}</td>
                  <td className="px-3 py-2 text-right">
                    {(() => {
                      const q = parseNumberLoose(r.quant);
                      if (q == null) return "";
                      return moeda(Number((q * Number(previstoCalcUnit || 0)).toFixed(2)));
                    })()}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {(() => {
                      const q = parseNumberLoose(r.quant);
                      const p = parseNumberLoose(r.valorParcial);
                      if (q == null || p == null) return "";
                      const calc = q * Number(previstoCalcUnit || 0);
                      const diff = Number((p - calc).toFixed(2));
                      const cls = Math.abs(diff) < 0.01 ? "text-slate-600" : diff > 0 ? "text-red-700" : "text-emerald-700";
                      return <span className={cls}>{moeda(diff)}</span>;
                    })()}
                  </td>
                </tr>
              ))}
              {previstoRows.length > 1 ? (
                <tr className="border-t bg-slate-50">
                  <td className="px-3 py-2 font-semibold" colSpan={5}>
                    Totais
                  </td>
                  <td className="px-3 py-2 text-right font-semibold">{moeda(Number(previstoTotal || 0))}</td>
                  <td className="px-3 py-2 text-right font-semibold">{moeda(Number(previstoCalcTotal || 0))}</td>
                  <td className="px-3 py-2 text-right font-semibold">{moeda(Number((Number(previstoTotal || 0) - Number(previstoCalcTotal || 0)).toFixed(2)))}</td>
                </tr>
              ) : null}
              {!previstoRows.length ? (
                <tr>
                  <td colSpan={8} className="px-3 py-6 text-center text-slate-500">
                    Serviço não encontrado na planilha atual.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-xl border bg-white p-4 shadow-sm space-y-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex-1 min-w-[280px]">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="text-lg font-semibold">Itens (composição)</div>
              <div className="flex items-center gap-2">
                <button
                  className="rounded-lg border bg-white px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-60"
                  type="button"
                  onClick={() => {
                    const qs = new URLSearchParams();
                    qs.set("codigo", String(codigoServico || "").trim());
                    qs.set("returnTo", `/dashboard/engenharia/obras/${idObra}/planilha/servicos/${encodeURIComponent(codigoServico)}`);
                    qs.set("from", "importar");
                    if (planilhaInfo?.idPlanilha) qs.set("planilhaId", String(planilhaInfo.idPlanilha));
                    router.push(`/dashboard/engenharia/obras/${idObra}/planilha/sinapi?${qs.toString()}`);
                  }}
                  disabled={loading}
                  title="Abrir Sinapi"
                >
                  SINAPI
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
                        tipoItem: "INSUMO",
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
                  <div className="text-base font-semibold text-slate-900">{moeda(Number(totalEquipBase || 0))}</div>
                  <div className="text-[11px] text-slate-500">
                    {totalBase > 0 ? `${((Number(totalEquipBase || 0) / Number(totalBase || 1)) * 100).toFixed(2)}%` : "—"}
                  </div>
                </div>
              </div>
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
                <div className="text-[11px] text-slate-500">Mão de obra (base)</div>
                <div className="mt-1 flex items-end justify-between gap-2">
                  <div className="text-base font-semibold text-slate-900">{moeda(Number(totalMaoBase || 0))}</div>
                  <div className="text-[11px] text-slate-500">
                    {totalBase > 0 ? `${((Number(totalMaoBase || 0) / Number(totalBase || 1)) * 100).toFixed(2)}%` : "—"}
                  </div>
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
              <div className="text-sm font-semibold text-slate-800">Parâmetros (Obra pública)</div>
              <div className="mt-2 overflow-auto">
                <table className="w-full min-w-[380px] border-collapse text-xs">
                  <thead className="bg-slate-50 text-center text-slate-700">
                    <tr>
                      <th className="border px-2 py-1">Parâmetros</th>
                      <th className="border px-2 py-1">SBC</th>
                      <th className="border px-2 py-1">SINAPI</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="border px-2 py-1">Data-base</td>
                      <td className="border px-2 py-1 text-center">{planilhaParams?.dataBaseSbc ? planilhaParams.dataBaseSbc : "—"}</td>
                      <td className="border px-2 py-1 text-center">{planilhaParams?.dataBaseSinapi ? planilhaParams.dataBaseSinapi : "—"}</td>
                    </tr>
                    <tr>
                      <td className="border px-2 py-1">BDI de Serviços (%)</td>
                      <td className="border px-2 py-1 text-center">{planilhaParams?.bdiServicosSbc == null ? "—" : Number(planilhaParams.bdiServicosSbc).toFixed(2)}</td>
                      <td className="border px-2 py-1 text-center">{planilhaParams?.bdiServicosSinapi == null ? "—" : Number(planilhaParams.bdiServicosSinapi).toFixed(2)}</td>
                    </tr>
                    <tr>
                      <td className="border px-2 py-1">BDI Diferenciado (%)</td>
                      <td className="border px-2 py-1 text-center">{planilhaParams?.bdiDiferenciadoSbc == null ? "—" : Number(planilhaParams.bdiDiferenciadoSbc).toFixed(2)}</td>
                      <td className="border px-2 py-1 text-center">{planilhaParams?.bdiDiferenciadoSinapi == null ? "—" : Number(planilhaParams.bdiDiferenciadoSinapi).toFixed(2)}</td>
                    </tr>
                    <tr>
                      <td className="border px-2 py-1">Enc. Sociais SEM Desoneração (%)</td>
                      <td className="border px-2 py-1 text-center">{planilhaParams?.encSociaisSemDesSbc == null ? "—" : Number(planilhaParams.encSociaisSemDesSbc).toFixed(2)}</td>
                      <td className="border px-2 py-1 text-center">{planilhaParams?.encSociaisSemDesSinapi == null ? "—" : Number(planilhaParams.encSociaisSemDesSinapi).toFixed(2)}</td>
                    </tr>
                    <tr>
                      <td className="border px-2 py-1">Desconto (%)</td>
                      <td className="border px-2 py-1 text-center">{planilhaParams?.descontoSbc == null ? "—" : Number(planilhaParams.descontoSbc).toFixed(2)}</td>
                      <td className="border px-2 py-1 text-center">{planilhaParams?.descontoSinapi == null ? "—" : Number(planilhaParams.descontoSinapi).toFixed(2)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            <div className="text-sm font-semibold text-slate-800">Composições</div>
            {renderItensTabela(itensComposicoes, displayPrefs.bgComposicoes)}
          </div>
          <div className="space-y-2">
            <div className="text-sm font-semibold text-slate-800">Material</div>
            {renderItensTabela(itensMateriais, displayPrefs.bgMateriais)}
          </div>
          <div className="space-y-2">
            <div className="text-sm font-semibold text-slate-800">Equipamento</div>
            {renderItensTabela(itensEquip, displayPrefs.bgEquipamentos)}
          </div>
          <div className="space-y-2">
            <div className="text-sm font-semibold text-slate-800">Mão de obra</div>
            {renderItensTabela(itensMao, displayPrefs.bgMao)}
          </div>
        </div>
      </section>
     </div>
   );
 }
