"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, CheckCircle2, Trash2, XCircle } from "lucide-react";
import * as XLSX from "xlsx";

type PreviewResult = {
  sheetName: string;
  uf: string | null;
  planilhaId: number | null;
  planilhaParams: {
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
  } | null;
  sinapiDetected: { dataBase: string | null };
  paramsMatch: boolean | null;
  paramsStatus?: "MATCH" | "MISMATCH" | "UNKNOWN";
  insumosModo?: string | null;
  parsedComposicoes: number;
  targetComposicoes: number;
  toImportComposicoes: number;
  toImportItens: number;
  skippedExisting: number;
  skippedNotInPlanilha: number;
  sample: Array<{
    codigo: string;
    descricao?: string | null;
    und?: string | null;
    valorSemBdi?: number | null;
    itens: Array<{
      tipoItem: string;
      tipoItemSinapi?: string;
      tipoSistema?: string;
      classificacao?: string | null;
      codigoItem: string;
      banco: string | null;
      descricao: string | null;
      und: string | null;
      quantidade: number;
      valorUnitario: number | null;
    }>;
  }>;
};

type ImportResult = {
  sheetName: string;
  uf: string | null;
  planilhaId: number | null;
  planilhaParams: PreviewResult["planilhaParams"];
  sinapiDetected: PreviewResult["sinapiDetected"];
  paramsMatch: PreviewResult["paramsMatch"];
  importedComposicoes: number;
  importedItens: number;
  skippedExisting: number;
  skippedNotInPlanilha: number;
};

type ApplyBaseResult = {
  codigoServico: string;
  dataBase: string;
  uf: string;
  insumosModo: string;
  mode: "MISSING_ONLY" | "UPSERT";
  importedItens: number;
  skippedExisting: boolean;
};

type ObraListaRow = { idObra: number; nomeObra: string; numeroContrato: string | null };
type ObraContratoInfo = { idObra: number; nomeObra: string; idContrato: number | null; numeroContrato: string; objeto: string | null };

const SINAPI_TELA_PREFS_DEFAULT = {
  colCodigo: true,
  colDescricao: true,
  colUnd: true,
  colValor: true,
  colUf: true,
  colDataBase: true,
  colInsumosModo: true,
  colAcoes: true,
  wCodigoPx: 110,
  wDescricaoPx: 520,
  wUndPx: 70,
  wValorPx: 160,
  wUfPx: 60,
  wDataBasePx: 110,
  wInsumosModoPx: 140,
  wAcoesPx: 150,
};

function normalizeHeader(input: string) {
  const s = String(input || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  const out = s.replace(/[^a-z0-9]+/g, "_").replace(/_+/g, "_").replace(/^_+|_+$/g, "");
  return out;
}

function parseNumberLoose(v: any): number | null {
  if (v == null) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = String(v || "").trim();
  if (!s) return null;
  const cleaned = s.replace(/\s/g, "").replace(/\./g, "").replace(/,/g, ".");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function parseCodigoServicoList(input: string): string[] {
  const raw = String(input || "")
    .trim()
    .toUpperCase()
    .replace(/[;\n\r\t]+/g, ",")
    .replace(/\s+/g, " ");
  if (!raw) return [];
  const parts = raw
    .split(",")
    .map((p) => String(p || "").trim())
    .filter(Boolean);
  const out: string[] = [];
  const seen = new Set<string>();
  for (const p of parts) {
    const code = p.replace(/\s/g, "").trim();
    if (!code) continue;
    if (seen.has(code)) continue;
    seen.add(code);
    out.push(code);
  }
  return out;
}

function makeImportadoKey(row: { codigo: string; dataBase: string; uf: string; insumosModo: string }) {
  return `${String(row.dataBase || "").trim()}:${String(row.uf || "").trim().toUpperCase()}:${String(row.insumosModo || "").trim().toUpperCase()}:${String(
    row.codigo || ""
  )
    .trim()
    .toUpperCase()}`;
}

function normalizeLooseText(input: string) {
  return String(input || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function pickInsumosSheetNameByMode(args: { sheetNames: string[]; insumosModo: "ISD" | "ICD" | "ISE" }) {
  const all = (args.sheetNames || []).map((n) => ({ name: n, key: normalizeHeader(n) }));
  const isPreco = (k: string) => (k.includes("preco") || k.includes("precos")) && (k.includes("insumo") || k.includes("insumos"));
  const hasToken = (k: string, token: string) => k === token || k.startsWith(`${token}_`) || k.endsWith(`_${token}`) || k.includes(`_${token}_`);
  const pickByExactToken = (token: string) => all.find((s) => String(s.key || "") === token)?.name || "";
  if (args.insumosModo === "ISD") {
    const exact = pickByExactToken("isd");
    if (exact) return exact;
    const hit =
      all.find((s) => isPreco(s.key) && hasToken(s.key, "isd")) ||
      all.find((s) => isPreco(s.key) && s.key.includes("sem_desoneracao")) ||
      all.find((s) => isPreco(s.key) && s.key.includes("encargos_sociais") && s.key.includes("sem_desoneracao")) ||
      all.find((s) => isPreco(s.key) && s.key.includes("sem_deson")) ||
      all.find((s) => isPreco(s.key) && s.key.includes("sem") && s.key.includes("desoneracao")) ||
      all.find((s) => isPreco(s.key) && s.key.includes("encargos") && s.key.includes("sem") && s.key.includes("desoner"));
    return hit?.name || "";
  }
  if (args.insumosModo === "ICD") {
    const exact = pickByExactToken("icd");
    if (exact) return exact;
    const hit =
      all.find((s) => isPreco(s.key) && hasToken(s.key, "icd")) ||
      all.find((s) => isPreco(s.key) && s.key.includes("com_desoneracao")) ||
      all.find((s) => isPreco(s.key) && s.key.includes("encargos_sociais") && s.key.includes("com_desoneracao")) ||
      all.find((s) => isPreco(s.key) && s.key.includes("com") && s.key.includes("desoneracao")) ||
      all.find((s) => isPreco(s.key) && s.key.includes("encargos") && s.key.includes("com") && s.key.includes("desoner"));
    return hit?.name || "";
  }
  const exact = pickByExactToken("ise");
  if (exact) return exact;
  const hit =
    all.find((s) => isPreco(s.key) && hasToken(s.key, "ise")) ||
    all.find((s) => isPreco(s.key) && s.key.includes("sem_encargos")) ||
    all.find((s) => isPreco(s.key) && s.key.includes("sem_encargos_sociais")) ||
    all.find((s) => isPreco(s.key) && s.key.includes("sem") && s.key.includes("encargos"));
  return hit?.name || "";
}

export default function SinapiImportPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const sp = useSearchParams();
  const idObra = Number(params?.id);
  const apiOriginPublic = String(process.env.NEXT_PUBLIC_API_URL || "").replace(/\/$/, "");
  const [apiOrigin, setApiOrigin] = useState<string>(apiOriginPublic);
  const returnTo = sp.get("returnTo") || "";
  const codigoParam = String(sp.get("codigo") || "").trim().toUpperCase();
  const dataBaseParam = String(sp.get("dataBase") || "").trim();
  const rootCodigoParam = String(sp.get("rootCodigo") || "").trim().toUpperCase();
  const planilhaIdParam = sp.get("planilhaId");
  const fromParam = String(sp.get("from") || "").trim().toLowerCase();
  const fromImportar = fromParam === "importar";
  const planilhaIdCaller = (() => {
    const n = Number(planilhaIdParam || 0);
    return Number.isFinite(n) && n > 0 ? n : 0;
  })();

  const [file, setFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [lastXlsxName, setLastXlsxName] = useState<string>("");
  const [lastXlsxReady, setLastXlsxReady] = useState<boolean>(false);
  const [sheetName, setSheetName] = useState<string>("Analítico");
  const [uf, setUf] = useState<string>("AC");
  const [insumosModo, setInsumosModo] = useState<"ISD" | "ICD" | "ISE">("ISD");
  const [insumosSheetName, setInsumosSheetName] = useState<string>("");
  const [codigoServico, setCodigoServico] = useState<string>(codigoParam);
  const [servicoBuscaModo, setServicoBuscaModo] = useState<"CODIGO" | "CONTEM">(codigoParam ? "CODIGO" : "CODIGO");
  const [descricaoServicoContem, setDescricaoServicoContem] = useState<string>("");
  const [codigoFiltro, setCodigoFiltro] = useState<string>(codigoParam);
  const [dataBaseFiltro, setDataBaseFiltro] = useState<string>(dataBaseParam);
  const [dataBaseImport, setDataBaseImport] = useState<string>(dataBaseParam);
  const [ufFiltro, setUfFiltro] = useState<string>("");
  const [insumosModoFiltro, setInsumosModoFiltro] = useState<"" | "ISD" | "ICD" | "ISE">("");
  const [targetObraId, setTargetObraId] = useState<number>(Number.isFinite(idObra) && idObra > 0 ? idObra : 0);
  const [obrasLista, setObrasLista] = useState<ObraListaRow[]>([]);
  const [opcao, setOpcao] = useState<"FALTAM" | "SUBSTITUIR" | "SERVICO" | "ARQUIVO">(codigoParam ? "SERVICO" : "FALTAM");
  const [forceDataBaseMismatch, setForceDataBaseMismatch] = useState<boolean>(false);
  const [busy, setBusy] = useState<boolean>(false);
  const [err, setErr] = useState<string>("");
  const [okMsg, setOkMsg] = useState<string>("");
  const [pageErr, setPageErr] = useState<string>("");
  const [pageOkMsg, setPageOkMsg] = useState<string>("");
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [imported, setImported] = useState<ImportResult | null>(null);
  const [appliedBase, setAppliedBase] = useState<ApplyBaseResult | null>(null);
  const [importados, setImportados] = useState<
    Array<{ codigo: string; descricao: string; und: string; valorComposicao: number | null; dataBase: string; uf: string; insumosModo: string }>
  >([]);
  const [importadosSelectedKeys, setImportadosSelectedKeys] = useState<string[]>([]);
  const [importadosErr, setImportadosErr] = useState<string>("");
  const [planilhaDataBaseSinapi, setPlanilhaDataBaseSinapi] = useState<string>("");
  const [planilhaUfSinapi, setPlanilhaUfSinapi] = useState<string>("");
  const [planilhaCallerInfo, setPlanilhaCallerInfo] = useState<{ idPlanilha: number; numeroVersao: number; nome: string } | null>(null);
  const [composicaoCard, setComposicaoCard] = useState<{
    codigo: string;
    descricao: string;
    und: string;
    uf: string;
    dataBase: string;
    insumosModo: string;
    valorSemBdi: number | null;
    itens: Array<{
      tipoItem: string;
      classificacao: string | null;
      codigoItem: string;
      descricao: string;
      und: string;
      coeficiente: number | null;
      valorUnitario: number | null;
      valor: number | null;
    }>;
  } | null>(null);
  const [composicaoBusy, setComposicaoBusy] = useState<boolean>(false);
  const [composicaoErr, setComposicaoErr] = useState<string>("");
  const [telaPrefs, setTelaPrefs] = useState<{ [K in keyof typeof SINAPI_TELA_PREFS_DEFAULT]: (typeof SINAPI_TELA_PREFS_DEFAULT)[K] }>(
    SINAPI_TELA_PREFS_DEFAULT
  );
  const [showTelaConfig, setShowTelaConfig] = useState<boolean>(false);
  const [showFiltros, setShowFiltros] = useState<boolean>(false);
  const [importOpen, setImportOpen] = useState<boolean>(false);
  const [importadosReloadTick, setImportadosReloadTick] = useState<number>(0);
  const [obraContrato, setObraContrato] = useState<ObraContratoInfo | null>(null);
  const [applySubstituirExistente, setApplySubstituirExistente] = useState<boolean>(true);
  const [previewItensLocal, setPreviewItensLocal] = useState<
    Array<{
      tipoItemSinapi: string;
      tipoSistema: string;
      classificacao: string | null;
      codigoItem: string;
      descricao: string | null;
      und: string | null;
      coeficiente: number;
      valorUnitario: number | null;
    }>
  >([]);
  const [previewCompLocal, setPreviewCompLocal] = useState<{ codigo: string; descricao: string | null; und: string | null; valorSemBdi: number | null } | null>(null);
  const [previewSelectedCodigo, setPreviewSelectedCodigo] = useState<string>("");
  const [previewSelectedCodigos, setPreviewSelectedCodigos] = useState<string[]>([]);
  const [previewOpen, setPreviewOpen] = useState<boolean>(false);
  const [previewGeradaPorContem, setPreviewGeradaPorContem] = useState<boolean>(false);
  const [previewItensLoadingCodigo, setPreviewItensLoadingCodigo] = useState<string>("");

  async function idbOpen() {
    return await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open("expplanobras", 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains("sinapi_files")) db.createObjectStore("sinapi_files");
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function idbGet<T>(key: string): Promise<T | null> {
    const db = await idbOpen();
    return await new Promise<T | null>((resolve) => {
      const tx = db.transaction("sinapi_files", "readonly");
      const store = tx.objectStore("sinapi_files");
      const req = store.get(key);
      req.onsuccess = () => resolve((req.result as T) ?? null);
      req.onerror = () => resolve(null);
      tx.oncomplete = () => db.close();
      tx.onerror = () => db.close();
    });
  }

  async function idbSet<T>(key: string, value: T) {
    const db = await idbOpen();
    await new Promise<void>((resolve) => {
      const tx = db.transaction("sinapi_files", "readwrite");
      const store = tx.objectStore("sinapi_files");
      store.put(value as any, key);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        resolve();
      };
    });
  }

  async function idbDel(key: string) {
    const db = await idbOpen();
    await new Promise<void>((resolve) => {
      const tx = db.transaction("sinapi_files", "readwrite");
      const store = tx.objectStore("sinapi_files");
      store.delete(key);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        resolve();
      };
    });
  }

  function resetSelectedFile() {
    setPreview(null);
    setPreviewItensLocal([]);
    setPreviewCompLocal(null);
    setPreviewSelectedCodigo("");
    setPreviewSelectedCodigos([]);
    setPreviewOpen(false);
    setPreviewGeradaPorContem(false);
    setPreviewItensLoadingCodigo("");
    setImported(null);
    setOkMsg("");
    setErr("");
  }

  async function selecionarXlsx() {
    try {
      if (busy) return;
      setErr("");
      const w: any = typeof window !== "undefined" ? (window as any) : null;
      if (w?.showOpenFilePicker) {
        const [handle] = await w.showOpenFilePicker({
          multiple: false,
          types: [
            {
              description: "Excel (.xlsx)",
              accept: { "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"] },
            },
          ],
        });
        if (!handle) return;
        const f = (await handle.getFile()) as File;
        setFile(f);
        resetSelectedFile();
        setLastXlsxName(String(f?.name || ""));
        localStorage.setItem("exp:sinapi:lastXlsxName", String(f?.name || ""));
        await idbSet("lastXlsxHandle", handle);
        setLastXlsxReady(true);
        return;
      }
      fileInputRef.current?.click();
    } catch (e: any) {
      setErr(e?.message || "Não foi possível selecionar o arquivo XLSX.");
    }
  }

  async function usarUltimoXlsx() {
    try {
      if (busy) return;
      setErr("");
      const handle: any = await idbGet<any>("lastXlsxHandle");
      if (!handle?.getFile) {
        setLastXlsxReady(false);
        return;
      }
      const f = (await handle.getFile()) as File;
      setFile(f);
      resetSelectedFile();
      setLastXlsxName(String(f?.name || ""));
      localStorage.setItem("exp:sinapi:lastXlsxName", String(f?.name || ""));
      setLastXlsxReady(true);
    } catch {
      await idbDel("lastXlsxHandle");
      setLastXlsxReady(false);
      setErr("Não foi possível reutilizar o último arquivo. Selecione novamente.");
    }
  }

  useEffect(() => {
    try {
      const name = localStorage.getItem("exp:sinapi:lastXlsxName") || "";
      setLastXlsxName(String(name || ""));
    } catch {}
    (async () => {
      try {
        const h: any = await idbGet<any>("lastXlsxHandle");
        setLastXlsxReady(Boolean(h?.getFile));
      } catch {
        setLastXlsxReady(false);
      }
    })();
  }, []);

  const importadosCodes = useMemo(() => {
    return new Set(importados.map((r) => String(r.codigo || "").trim().toUpperCase()).filter(Boolean));
  }, [importados]);

  const importadosSelectedSet = useMemo(() => new Set(importadosSelectedKeys), [importadosSelectedKeys]);
  const importadosSelectedRows = useMemo(() => {
    if (!importadosSelectedKeys.length) return [];
    const set = new Set(importadosSelectedKeys);
    return importados.filter((r) => set.has(makeImportadoKey(r)));
  }, [importados, importadosSelectedKeys]);

  const importadosLayout = useMemo(() => {
    const cols: Array<{ key: string; label: string; widthPx: number; align?: "left" | "center" | "right" }> = [];
    cols.push({ key: "__sel", label: "Sel", widthPx: 52, align: "center" });
    if (telaPrefs.colCodigo) cols.push({ key: "codigo", label: "Código", widthPx: telaPrefs.wCodigoPx, align: "center" });
    if (telaPrefs.colDescricao) cols.push({ key: "descricao", label: "Descrição", widthPx: telaPrefs.wDescricaoPx, align: "left" });
    if (telaPrefs.colUnd) cols.push({ key: "und", label: "un", widthPx: telaPrefs.wUndPx, align: "center" });
    if (telaPrefs.colValor) cols.push({ key: "valor", label: "Valor da composição", widthPx: telaPrefs.wValorPx, align: "right" });
    if (telaPrefs.colUf) cols.push({ key: "uf", label: "UF", widthPx: telaPrefs.wUfPx, align: "center" });
    if (telaPrefs.colDataBase) cols.push({ key: "dataBase", label: "Data-base", widthPx: telaPrefs.wDataBasePx, align: "center" });
    if (telaPrefs.colInsumosModo) cols.push({ key: "insumosModo", label: "Preços de insumos", widthPx: telaPrefs.wInsumosModoPx, align: "center" });
    if (telaPrefs.colAcoes) cols.push({ key: "acoes", label: "Ações", widthPx: telaPrefs.wAcoesPx, align: "center" });
    const gridTemplateColumns = cols.map((c) => `${Math.max(40, Number(c.widthPx || 0))}px`).join(" ");
    const minWidthPx = cols.reduce((acc, c) => acc + Math.max(40, Number(c.widthPx || 0)), 0);
    return { cols, gridTemplateColumns, minWidthPx };
  }, [telaPrefs]);

  useEffect(() => {
    const allowed = new Set(importados.map((r) => makeImportadoKey(r)));
    setImportadosSelectedKeys((prev) => (Array.isArray(prev) ? prev.filter((k) => allowed.has(k)) : []));
  }, [importados]);

  const breadcrumb = useMemo(() => {
    const base = "Engenharia → Obras → Obra selecionada → Planilha orçamentária";
    const root = String(rootCodigoParam || "").trim();
    const cur = String(codigoParam || "").trim();
    if (root || cur) {
      const titulo = root && cur && root !== cur ? `${root} / ${cur}` : root || cur;
      return `${base} → Análise de composição - ${titulo} → Sinapi`;
    }
    return `${base} → Sinapi`;
  }, [codigoParam, rootCodigoParam]);

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


  const previewRequirements = useMemo(() => {
    const missing: string[] = [];
    if (!String(dataBaseImport || "").trim()) missing.push("Data-base (SINAPI)");
    if (!String(sheetName || "").trim()) missing.push("Aba (Relatório Analítico)");
    if (!String(uf || "").trim()) missing.push("UF");
    if (!String(insumosModo || "").trim()) missing.push("Preços de insumos (modo)");
    if (!file) missing.push("Arquivo XLSX");
    if (opcao === "SERVICO") {
      if (servicoBuscaModo === "CODIGO" && !String(codigoServico || "").trim()) missing.push("Código do serviço");
      if (servicoBuscaModo === "CONTEM" && !String(descricaoServicoContem || "").trim()) missing.push("Descrição contém");
    }
    if ((opcao === "FALTAM" || opcao === "SUBSTITUIR") && !(Number.isFinite(targetObraId) && targetObraId > 0)) missing.push("Obra/Licitação/Orçamento");
    return { ok: missing.length === 0, missing };
  }, [dataBaseImport, sheetName, uf, insumosModo, file, opcao, codigoServico, targetObraId, servicoBuscaModo, descricaoServicoContem]);

  const checklistInterno = useMemo(() => {
    const sheetInsumos = String(insumosSheetName || "").trim();
    const items: Array<{ titulo: string; status: "OK" | "PENDENTE" | "NA_PREVIA" }> = [
      { titulo: "Data-base informada", status: String(dataBaseImport || "").trim() ? "OK" : "PENDENTE" },
      { titulo: "UF selecionada", status: String(uf || "").trim() ? "OK" : "PENDENTE" },
      { titulo: "Aba do Analítico definida", status: String(sheetName || "").trim() ? "OK" : "PENDENTE" },
      { titulo: `Modo de insumos (${String(insumosModo || "").trim() || "—"})`, status: String(insumosModo || "").trim() ? "OK" : "PENDENTE" },
      { titulo: sheetInsumos ? "Nome da aba (preços de insumos) informado" : "Nome da aba (preços de insumos): automático", status: "OK" },
      { titulo: "Arquivo XLSX selecionado", status: file ? "OK" : "PENDENTE" },
    ];

    if (opcao === "SERVICO") {
      if (servicoBuscaModo === "CODIGO") items.push({ titulo: "Código do serviço informado", status: String(codigoServico || "").trim() ? "OK" : "PENDENTE" });
      else items.push({ titulo: "Descrição contém informada", status: String(descricaoServicoContem || "").trim() ? "OK" : "PENDENTE" });
    }
    if (opcao === "FALTAM" || opcao === "SUBSTITUIR")
      items.push({ titulo: "Obra/Licitação/Orçamento selecionada", status: Number.isFinite(targetObraId) && targetObraId > 0 ? "OK" : "PENDENTE" });

    const previewStatus: "OK" | "NA_PREVIA" = preview ? "OK" : "NA_PREVIA";
    const localizarAbaStatus: "OK" | "NA_PREVIA" = sheetInsumos ? "OK" : previewStatus;
    items.push(
      { titulo: sheetInsumos ? "Aba de insumos informada (não precisa localizar automaticamente)" : "Localizar aba ISD/ICD/ISE automaticamente (quando não informar)", status: localizarAbaStatus },
      { titulo: "Percorrer linhas/colunas para encontrar o cabeçalho de insumos", status: previewStatus },
      { titulo: "Validar itens do cabeçalho (classificação, código, descrição, unidade, UF/P.U.)", status: previewStatus },
      { titulo: "Ler preços da UF selecionada (P.U.)", status: previewStatus },
      { titulo: "Ler itens do Analítico e cruzar com preços de insumos", status: previewStatus },
      { titulo: "Gerar prévia com contadores e amostras", status: previewStatus }
    );

    return items;
  }, [dataBaseImport, uf, sheetName, insumosModo, insumosSheetName, file, opcao, codigoServico, targetObraId, preview, servicoBuscaModo, descricaoServicoContem]);

  const previewComposicoesParaLista = useMemo(() => {
    const fromServer = Array.isArray(preview?.sample)
      ? preview!.sample.map((c) => ({
          codigo: String(c?.codigo || "").trim().toUpperCase(),
          descricao: c?.descricao ?? null,
          und: c?.und ?? null,
          valorSemBdi: (() => {
            if (c?.valorSemBdi == null) return null;
            const n = Number(c.valorSemBdi);
            return Number.isFinite(n) ? n : null;
          })(),
        }))
      : [];
    const list = fromServer.filter((x) => x.codigo);
    if (!list.length && previewCompLocal?.codigo) return [previewCompLocal];
    return list;
  }, [preview, previewCompLocal]);

  const previewSelectedComposicao = useMemo(() => {
    const codigo = String(previewSelectedCodigo || "").trim().toUpperCase();
    if (!codigo) return null;
    return previewComposicoesParaLista.find((c) => String(c.codigo || "").trim().toUpperCase() === codigo) || null;
  }, [previewComposicoesParaLista, previewSelectedCodigo]);

  const previewItensDoSelecionado = useMemo(() => {
    const codigo = String(previewSelectedCodigo || "").trim().toUpperCase();
    if (!codigo) return [];
    if (previewCompLocal?.codigo && previewCompLocal.codigo === codigo && previewItensLocal.length) return previewItensLocal;
    const entry = Array.isArray(preview?.sample)
      ? preview!.sample.find((c) => String(c?.codigo || "").trim().toUpperCase() === codigo)
      : null;
    const itens = Array.isArray(entry?.itens) ? entry!.itens : [];
    return itens.map((it: any) => {
      const tipoItemSinapi = String(it?.tipoItemSinapi || it?.tipoItem || "").trim().toUpperCase();
      const classificacao = it?.classificacao == null ? null : String(it.classificacao || "").trim();
      const tipoSistemaRaw = String(it?.tipoSistema || "").trim();
      const tipoSistema =
        tipoSistemaRaw ||
        (tipoItemSinapi === "COMPOSICAO"
          ? "COMPOSICAO"
          : tipoItemSinapi === "INSUMO"
            ? String(classificacao || "INSUMO").trim() || "INSUMO"
            : String(tipoItemSinapi || "—").trim() || "—");
      return {
        tipoItemSinapi: tipoItemSinapi || "—",
        tipoSistema: tipoSistema || "—",
        classificacao,
        codigoItem: String(it?.codigoItem || "").trim(),
        descricao: it?.descricao ?? null,
        und: it?.und ?? null,
        coeficiente: Number(it?.quantidade ?? 0),
        valorUnitario: it?.valorUnitario ?? null,
      };
    });
  }, [preview, previewCompLocal, previewItensLocal, previewSelectedCodigo]);

  const previewValorSemBdiSelecionado = useMemo(() => {
    const fromList = previewSelectedComposicao?.valorSemBdi;
    if (fromList != null && Number.isFinite(Number(fromList))) return Number(fromList);
    const total = previewItensDoSelecionado.reduce((acc, it) => {
      const q = Number(it.coeficiente || 0);
      const vu = it.valorUnitario == null ? 0 : Number(it.valorUnitario);
      if (!Number.isFinite(q) || !Number.isFinite(vu)) return acc;
      return acc + q * vu;
    }, 0);
    return Number.isFinite(total) ? total : null;
  }, [previewItensDoSelecionado, previewSelectedComposicao]);

  useEffect(() => {
    const list = previewComposicoesParaLista;
    if (!list.length) {
      setPreviewSelectedCodigo("");
      setPreviewSelectedCodigos([]);
      return;
    }
    const cur = String(previewSelectedCodigo || "").trim().toUpperCase();
    if (!cur) {
      setPreviewSelectedCodigo(list[0].codigo);
      setPreviewSelectedCodigos([list[0].codigo]);
      return;
    }
    const exists = list.some((c) => String(c.codigo || "").trim().toUpperCase() === cur);
    if (!exists) {
      setPreviewSelectedCodigo(list[0].codigo);
      setPreviewSelectedCodigos([list[0].codigo]);
      return;
    }
    setPreviewSelectedCodigos((prev) => {
      const prevNorm = Array.isArray(prev) ? prev.map((x) => String(x || "").trim().toUpperCase()).filter(Boolean) : [];
      const allowed = new Set(list.map((x) => String(x.codigo || "").trim().toUpperCase()).filter(Boolean));
      const filtered = prevNorm.filter((x) => allowed.has(x));
      if (!filtered.length) return [cur];
      return filtered;
    });
  }, [previewComposicoesParaLista, previewSelectedCodigo]);

  useEffect(() => {
    if (!previewOpen) return;
    if (!previewGeradaPorContem) return;
    const codigo = String(previewSelectedCodigo || "").trim().toUpperCase();
    if (!codigo) return;
    if (!preview || !Array.isArray(preview.sample)) return;
    const entry = preview.sample.find((c) => String(c?.codigo || "").trim().toUpperCase() === codigo) as any;
    if (!entry) return;
    const itens = Array.isArray(entry?.itens) ? entry.itens : [];
    if (itens.length) return;
    if (previewItensLoadingCodigo === codigo) return;
    setPreviewItensLoadingCodigo(codigo);
    (async () => {
      try {
        const data = (await doRequest(true, { codigoServico: codigo }, { commitToState: false, manageBusy: true })) as PreviewResult | null;
        const sample0 = Array.isArray((data as any)?.sample) ? (data as any).sample[0] : null;
        if (!sample0) return;
        setPreview((cur) => {
          if (!cur || !Array.isArray(cur.sample)) return cur;
          const nextSample = cur.sample.map((s) => {
            const sc = String((s as any)?.codigo || "").trim().toUpperCase();
            if (sc !== codigo) return s;
            return { ...s, ...sample0 };
          });
          return { ...cur, sample: nextSample };
        });
      } catch (e: any) {
        setErr(String(e?.message || "Erro ao carregar itens da prévia"));
      } finally {
        setPreviewItensLoadingCodigo("");
      }
    })();
  }, [previewOpen, previewGeradaPorContem, previewSelectedCodigo, preview, previewItensLoadingCodigo]);

  useEffect(() => {
    if (apiOrigin) return;
    (async () => {
      try {
        const res = await fetch("/health", { cache: "no-store" });
        const json = await res.json().catch(() => null);
        const origin = String(json?.apiOrigin || "").replace(/\/$/, "");
        if (origin) setApiOrigin(origin);
      } catch {}
    })();
  }, [apiOrigin]);

  const returnToKey = useMemo(() => `expplanobras:sinapi:returnTo:${idObra}`, [idObra]);
  useEffect(() => {
    if (!returnTo) return;
    try {
      localStorage.setItem(returnToKey, returnTo);
    } catch {}
  }, [returnTo, returnToKey]);

  const backHref = useMemo(() => {
    if (returnTo) return returnTo;
    try {
      const saved = localStorage.getItem(returnToKey);
      if (saved) return saved;
    } catch {}
    return `/dashboard/engenharia/obras/${idObra}/planilha`;
  }, [idObra, returnTo, returnToKey]);

  const importPrefsKey = useMemo(() => `expplanobras:sinapi:importPrefs`, []);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(importPrefsKey);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      const ufSaved = String(parsed?.uf || "").trim().toUpperCase();
      const modoSaved = String(parsed?.insumosModo || "").trim().toUpperCase();
      const abaSaved = String(parsed?.insumosSheetName || "").trim();
      if (ufSaved && ufs.includes(ufSaved)) setUf(ufSaved);
      if (modoSaved === "ISD" || modoSaved === "ICD" || modoSaved === "ISE") setInsumosModo(modoSaved as any);
      if (abaSaved) setInsumosSheetName(abaSaved);
    } catch {}
  }, [importPrefsKey, ufs]);

  useEffect(() => {
    try {
      localStorage.setItem(
        importPrefsKey,
        JSON.stringify({
          uf,
          insumosModo,
          insumosSheetName,
        })
      );
    } catch {}
  }, [importPrefsKey, uf, insumosModo, insumosSheetName]);

  const telaPrefsKey = useMemo(() => `expplanobras:sinapi:telaPrefs:v1`, []);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(telaPrefsKey);
      if (!raw) return;
      const p = JSON.parse(raw) as any;
      const n = (v: unknown, min: number, max: number, fallback: number) => {
        const x = Number(v);
        return Number.isFinite(x) ? Math.max(min, Math.min(max, Math.round(x))) : fallback;
      };
      setTelaPrefs((cur) => ({
        colCodigo: p?.colCodigo !== false,
        colDescricao: p?.colDescricao !== false,
        colUnd: p?.colUnd !== false,
        colValor: p?.colValor !== false,
        colUf: p?.colUf !== false,
        colDataBase: p?.colDataBase !== false,
        colInsumosModo: p?.colInsumosModo !== false,
        colAcoes: p?.colAcoes !== false,
        wCodigoPx: n(p?.wCodigoPx, 70, 220, cur.wCodigoPx),
        wDescricaoPx: n(p?.wDescricaoPx, 220, 1200, cur.wDescricaoPx),
        wUndPx: n(p?.wUndPx, 40, 120, cur.wUndPx),
        wValorPx: n(p?.wValorPx, 110, 240, cur.wValorPx),
        wUfPx: n(p?.wUfPx, 44, 100, cur.wUfPx),
        wDataBasePx: n(p?.wDataBasePx, 84, 160, cur.wDataBasePx),
        wInsumosModoPx: n(p?.wInsumosModoPx, 110, 220, cur.wInsumosModoPx),
        wAcoesPx: n(p?.wAcoesPx, 110, 240, cur.wAcoesPx),
      }));
    } catch {}
  }, [telaPrefsKey]);

  useEffect(() => {
    try {
      localStorage.setItem(telaPrefsKey, JSON.stringify(telaPrefs));
    } catch {}
  }, [telaPrefsKey, telaPrefs]);

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

  useEffect(() => {
    if (!Number.isFinite(idObra) || idObra <= 0) return;
    let alive = true;
    (async () => {
      try {
        const res = await authFetch(`/api/v1/engenharia/obras/${idObra}/contrato`);
        const json = await res.json().catch(() => null);
        if (!alive) return;
        if (!res.ok || !json?.success) throw new Error(json?.message || "Falha ao carregar dados da obra/contrato");
        const data = json.data || {};
        setObraContrato({
          idObra,
          nomeObra: String(data?.nomeObra || ""),
          idContrato: data?.idContrato != null ? Number(data.idContrato) : null,
          numeroContrato: String(data?.numeroContrato || ""),
          objeto: data?.objeto != null ? String(data.objeto) : null,
        });
      } catch {
        if (!alive) return;
        setObraContrato(null);
      }
    })();
    return () => {
      alive = false;
    };
  }, [idObra]);

  async function persistPlanilhaUfSinapiIfMissing(nextUf: string) {
    const ufValue = String(nextUf || "").trim().toUpperCase();
    if (!ufValue) return;
    const idPlanilha = planilhaCallerInfo?.idPlanilha != null ? Number(planilhaCallerInfo.idPlanilha) : 0;
    if (!Number.isFinite(idPlanilha) || idPlanilha <= 0) return;
    if (String(planilhaUfSinapi || "").trim()) return;
    try {
      const resP = await authFetch(`/api/v1/engenharia/obras/${idObra}/planilha?planilhaId=${idPlanilha}`);
      const jsonP = await resP.json().catch(() => null);
      if (!resP.ok || !jsonP?.success) return;
      const currentParams = (jsonP.data?.planilha?.parametros || {}) as any;
      if (String(currentParams?.ufSinapi || "").trim()) return;
      const merged = { ...currentParams, ufSinapi: ufValue };
      const resU = await authFetch(`/api/v1/engenharia/obras/${idObra}/planilha`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "ATUALIZAR_PARAMETROS", idPlanilha, parametros: merged }),
      });
      const jsonU = await resU.json().catch(() => null);
      if (!resU.ok || !jsonU?.success) return;
      setPlanilhaUfSinapi(ufValue);
    } catch {}
  }

  async function abrirComposicaoDoImportado(row: { codigo: string; dataBase: string; uf: string; insumosModo: string }) {
    const codigo = String(row.codigo || '').trim().toUpperCase();
    const dataBase = String(row.dataBase || '').trim();
    const uf = String(row.uf || '').trim().toUpperCase();
    const insumosModo = String(row.insumosModo || '').trim().toUpperCase();
    if (!codigo || !dataBase || !uf || !insumosModo) return;
    if (!Number.isFinite(idObra) || idObra <= 0) return;
    setComposicaoErr('');
    setComposicaoBusy(true);
    try {
      const qs = new URLSearchParams();
      qs.set('codigo', codigo);
      qs.set('dataBase', dataBase);
      qs.set('uf', uf);
      qs.set('insumosModo', insumosModo);
      const res = await authFetch(`/api/v1/engenharia/obras/${idObra}/planilha/sinapi/composicao?${qs.toString()}`);
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.message || 'Falha ao carregar composição');
      const d = json.data || {};
      setComposicaoCard({
        codigo: String(d.codigo || ''),
        descricao: String(d.descricao || ''),
        und: String(d.und || ''),
        uf: String(d.uf || ''),
        dataBase: String(d.dataBase || ''),
        insumosModo: String(d.insumosModo || ''),
        valorSemBdi: d.valorSemBdi == null ? null : Number(d.valorSemBdi),
        itens: Array.isArray(d.itens)
          ? d.itens.map((x: any) => ({
              tipoItem: String(x.tipoItem || ''),
              classificacao: x.classificacao == null ? null : String(x.classificacao || ''),
              codigoItem: String(x.codigoItem || ''),
              descricao: String(x.descricao || ''),
              und: String(x.und || ''),
              coeficiente: x.coeficiente == null ? null : Number(x.coeficiente),
              valorUnitario: x.valorUnitario == null ? null : Number(x.valorUnitario),
              valor: x.valor == null ? null : Number(x.valor),
            }))
          : [],
      });
    } catch (e: any) {
      setComposicaoCard(null);
      setComposicaoErr(String(e?.message || 'Erro ao carregar composição'));
    } finally {
      setComposicaoBusy(false);
    }
  }

  async function doRequest(
    dryRun: boolean,
    override?: { codigoServico?: string },
    opts?: { commitToState?: boolean; manageBusy?: boolean }
  ): Promise<PreviewResult | ImportResult | null> {
    const commitToState = opts?.commitToState !== false;
    const manageBusy = opts?.manageBusy !== false;
    if (!Number.isFinite(idObra) || idObra <= 0) {
      if (commitToState) {
        setErr("Obra inválida.");
        return null;
      }
      throw new Error("Obra inválida.");
    }
    if (commitToState) {
      setErr("");
      setOkMsg("");
      setImported(null);
      setAppliedBase(null);
    }
    if (!file) {
      if (commitToState) {
        setErr("Selecione o arquivo XLSX do SINAPI para importar.");
        return null;
      }
      throw new Error("Selecione o arquivo XLSX do SINAPI para importar.");
    }
    if (manageBusy) setBusy(true);
    try {
      const computedMode: "MISSING_ONLY" | "UPSERT" = opcao === "SUBSTITUIR" || opcao === "SERVICO" ? "UPSERT" : "MISSING_ONLY";
      const computedImportAllParsed = opcao === "ARQUIVO";
      const overrideCodigoServico = String(override?.codigoServico || "").trim().toUpperCase();
      const computedCodigoServico = overrideCodigoServico || (opcao === "SERVICO" ? codigoServico.trim().toUpperCase() : "");
      if (opcao === "SERVICO" && !computedCodigoServico) {
        if (commitToState) {
          setErr("Informe o código do serviço.");
          return null;
        }
        throw new Error("Informe o código do serviço.");
      }

      const shouldUseParsed =
        Boolean(computedCodigoServico) &&
        file.size >= 4 * 1024 * 1024;

      if (shouldUseParsed) {
        const buffer = await file.arrayBuffer();
        const wb = XLSX.read(buffer, { type: "array", cellDates: false });

        const analiticoSheet = wb.Sheets[sheetName] || wb.Sheets[String(sheetName || "").trim()] || null;
        if (!analiticoSheet) {
          const names = (wb.SheetNames || []).slice(0, 30).join(", ");
          throw new Error(`Aba não encontrada: "${sheetName}". Abas disponíveis: ${names || "—"}`);
        }

        const insumosSheetNameFinal = String(insumosSheetName || "").trim() || pickInsumosSheetNameByMode({ sheetNames: wb.SheetNames || [], insumosModo });
        const insumosSheet = insumosSheetNameFinal ? wb.Sheets[insumosSheetNameFinal] : null;
        if (!insumosSheet) {
          const names = (wb.SheetNames || []).slice(0, 30).join(", ");
          throw new Error(
            insumosSheetNameFinal
              ? `Aba de insumos não encontrada: "${insumosSheetNameFinal}". Abas disponíveis: ${names || "—"}`
              : `Não foi possível localizar a aba de preços de insumos para ${insumosModo}. Abas disponíveis: ${names || "—"}.`
          );
        }

        const parseInsumos = () => {
          const m = XLSX.utils.sheet_to_json(insumosSheet, { header: 1, defval: "" }) as any[][];
          const map = new Map<string, { classificacao: string; descricao: string; und: string; preco: number | null }>();
          if (!Array.isArray(m) || m.length < 2) return map;
          const ufLower = String(uf || "").trim().toLowerCase();
          let headerIdx = -1;
          let rawHeader: any[] = [];
          for (let i = 0; i < Math.min(120, m.length); i++) {
            const r = Array.isArray(m[i]) ? m[i] : [];
            const keys = r.map((c) => normalizeHeader(String(c || ""))).filter(Boolean);
            if (keys.length < 4) continue;
            const hasCodigo = keys.some((k) => k.includes("codigo") && (k.includes("insumo") || k.includes("item") || k === "codigo"));
            const hasDesc = keys.some((k) => k.includes("descricao"));
            const hasUnd = keys.some((k) => k === "unidade" || k === "und" || k.startsWith("unid"));
            if (hasCodigo && hasDesc && hasUnd) {
              headerIdx = i;
              rawHeader = r;
              break;
            }
          }
          if (headerIdx < 0) return map;
          const headersNorm = rawHeader.map((h) => normalizeHeader(String(h || "")));
          const findCol = (cands: string[]) => {
            for (const c of cands) {
              const idx = headersNorm.findIndex((h) => h === c);
              if (idx >= 0) return idx;
            }
            for (const c of cands) {
              const idx = headersNorm.findIndex((h) => h.includes(c));
              if (idx >= 0) return idx;
            }
            return -1;
          };
          const iClass = findCol(["classificacao"]);
          const iCod = findCol(["codigo_item", "codigo"]);
          const iDesc = findCol(["descricao_item", "descricao", "insumo"]);
          const iUnd = findCol(["und", "unid", "unidade"]);
          let iPreco = headersNorm.findIndex((h) => h === ufLower);
          if (iPreco < 0) iPreco = headersNorm.findIndex((h) => h.includes(ufLower));
          for (let i = headerIdx + 1; i < m.length; i++) {
            const r = Array.isArray(m[i]) ? m[i] : [];
            const cod = iCod >= 0 ? String(r[iCod] || "").trim().toUpperCase() : "";
            if (!cod) continue;
            const classificacao = iClass >= 0 ? String(r[iClass] || "").trim() : "";
            const descricao = iDesc >= 0 ? String(r[iDesc] || "").trim() : "";
            const und = iUnd >= 0 ? String(r[iUnd] || "").trim() : "";
            const preco = iPreco >= 0 ? parseNumberLoose(r[iPreco]) : null;
            map.set(cod, { classificacao, descricao, und, preco });
          }
          return map;
        };

        const insumosMap = parseInsumos();
        if (!insumosMap.size) throw new Error(`Não foi possível ler os preços do UF ${String(uf || "").trim().toUpperCase()} na aba de insumos (${insumosSheetNameFinal}).`);

        const parseAnaliticoServico = () => {
          const m = XLSX.utils.sheet_to_json(analiticoSheet, { header: 1, defval: "" }) as any[][];
          if (!Array.isArray(m) || m.length < 2) return { composicao: null as any, itens: [] as any[] };
          let headerIdx = -1;
          let rawHeader: any[] = [];
          for (let i = 0; i < Math.min(160, m.length); i++) {
            const r = Array.isArray(m[i]) ? m[i] : [];
            const keys = r.map((c) => normalizeHeader(String(c || ""))).filter(Boolean);
            if (keys.length < 6) continue;
            const hasComp = keys.some((k) => k.includes("codigo") && k.includes("compos"));
            const hasCodItem = keys.some((k) => k.includes("codigo") && k.includes("item"));
            const hasCoef = keys.some((k) => k.includes("coef"));
            if (hasComp && hasCodItem && hasCoef) {
              headerIdx = i;
              rawHeader = r;
              break;
            }
          }
          if (headerIdx < 0) return { composicao: null as any, itens: [] as any[] };
          const headersNorm = rawHeader.map((h) => normalizeHeader(String(h || "")));
          const findCol = (cands: string[]) => {
            for (const c of cands) {
              const idx = headersNorm.findIndex((h) => h === c);
              if (idx >= 0) return idx;
            }
            for (const c of cands) {
              const idx = headersNorm.findIndex((h) => h.includes(c));
              if (idx >= 0) return idx;
            }
            return -1;
          };
          const iCodigoComp = findCol(["codigo_composicao", "codigo_da_composicao", "codigo_composicao_sinapi"]);
          const iTipo = findCol(["tipo_item", "tipo"]);
          const iCodigoItem = findCol(["codigo_item", "codigo_do_item", "codigo"]);
          const iDescItem = findCol(["descricao_item", "descricao_do_item", "descricao"]);
          const iUndItem = findCol(["unidade", "und", "unid"]);
          const iCoef = findCol(["coeficiente", "coef"]);
          const iDescComp = findCol(["descricao_da_composicao", "descricao_composicao", "desc_composicao", "descricao_compos"]);
          const iUndComp = findCol(["unidade_da_composicao", "unidade_composicao", "und_composicao", "unidade_compos", "und_compos"]);

          let compDescricao = "";
          let compUnd = "";
          const out: any[] = [];
          for (let i = headerIdx + 1; i < m.length; i++) {
            const r = Array.isArray(m[i]) ? m[i] : [];
            const comp = iCodigoComp >= 0 ? String(r[iCodigoComp] || "").trim().toUpperCase() : "";
            if (!comp) continue;
            if (comp !== computedCodigoServico) continue;
            const codigoItem = iCodigoItem >= 0 ? String(r[iCodigoItem] || "").trim().toUpperCase() : "";
            const coef = iCoef >= 0 ? parseNumberLoose(r[iCoef]) : null;
            const tipoRaw = iTipo >= 0 ? String(r[iTipo] || "").trim() : "";
            if (!compDescricao && iDescComp >= 0) compDescricao = String(r[iDescComp] || "").trim();
            if (!compUnd && iUndComp >= 0) compUnd = String(r[iUndComp] || "").trim();
            if (!codigoItem && coef == null && !tipoRaw) {
              if (!compDescricao) {
                if (iDescComp >= 0) compDescricao = String(r[iDescComp] || "").trim();
                else if (iDescItem >= 0) compDescricao = String(r[iDescItem] || "").trim();
              }
              if (!compUnd) {
                if (iUndComp >= 0) compUnd = String(r[iUndComp] || "").trim();
                else if (iUndItem >= 0) compUnd = String(r[iUndItem] || "").trim();
              }
              continue;
            }
            if (!codigoItem) continue;
            if (coef == null) continue;
            const tipoKey = normalizeHeader(tipoRaw);
            const tipoItem = tipoKey.includes("insumo") ? "INSUMO" : "COMPOSICAO";
            const desc = iDescItem >= 0 ? String(r[iDescItem] || "").trim() : "";
            const und = iUndItem >= 0 ? String(r[iUndItem] || "").trim() : "";
            const ins = insumosMap.get(codigoItem) || null;
            const insumoPu = ins?.preco ?? null;
            const expTipo = tipoItem === "INSUMO" ? String(ins?.classificacao || "INSUMO").trim() || "INSUMO" : "COMPOSICAO";
            out.push({
              codigoItem,
              coeficiente: coef,
              tipoItemSinapi: tipoItem,
              descricaoSinapi: desc || null,
              undSinapi: und || null,
              insumoClassificacao: ins?.classificacao || null,
              insumoDescricao: ins?.descricao || null,
              insumoUnd: ins?.und || null,
              insumoPu: insumoPu,
              expTipo,
              expCodigo: codigoItem,
              expDescricao: desc || ins?.descricao || null,
              expUnd: und || ins?.und || null,
              expValorUnitario: tipoItem === "INSUMO" ? insumoPu : null,
            });
          }
          return { composicao: { codigo: computedCodigoServico, descricao: compDescricao || null, und: compUnd || null }, itens: out };
        };

        const parsedLocal = parseAnaliticoServico();
        if (!parsedLocal.itens.length) throw new Error(`Serviço ${computedCodigoServico} não encontrado na aba "${sheetName}".`);

        if (commitToState) {
          setPreviewItensLocal(
            parsedLocal.itens.map((it: any) => ({
              tipoItemSinapi: String(it.tipoItemSinapi || "").trim() || "—",
              tipoSistema: String(it.expTipo || "").trim() || "—",
              classificacao: it.insumoClassificacao ?? null,
              codigoItem: String(it.expCodigo || it.codigoItem || "").trim(),
              descricao: it.expDescricao ?? it.insumoDescricao ?? it.descricaoSinapi ?? null,
              und: it.expUnd ?? it.insumoUnd ?? it.undSinapi ?? null,
              coeficiente: Number(it.coeficiente),
              valorUnitario: it.expValorUnitario ?? it.insumoPu ?? null,
            }))
          );
          setPreviewCompLocal({
            codigo: parsedLocal.composicao?.codigo ? String(parsedLocal.composicao.codigo).trim().toUpperCase() : computedCodigoServico,
            descricao: parsedLocal.composicao?.descricao ?? null,
            und: parsedLocal.composicao?.und ?? null,
            valorSemBdi: (() => {
              const total = parsedLocal.itens.reduce((acc: number, it: any) => acc + Number(it.coeficiente || 0) * Number(it.expValorUnitario ?? it.insumoPu ?? 0), 0);
              return Number.isFinite(total) ? total : null;
            })(),
          });
          setPreviewSelectedCodigo(computedCodigoServico);
        }

        const res = await authFetch(`/api/v1/engenharia/obras/${idObra}/planilha/sinapi/import-analitico-parsed`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            uf: String(uf || "").trim().toUpperCase(),
            insumosModo,
            codigoServico: computedCodigoServico,
            sinapiDataBase: String(dataBaseImport || "").trim() || undefined,
            banco: "SINAPI",
            targetObraId: Number.isFinite(targetObraId) && targetObraId > 0 ? targetObraId : undefined,
            mode: computedMode,
            dryRun,
            forceDataBaseMismatch,
            composicao: parsedLocal.composicao,
            itens: parsedLocal.itens,
          }),
        });
        const json = await res.json().catch(() => null);
        if (!res.ok || !json?.success) throw new Error(json?.message || "Falha ao processar importação SINAPI");

        if (dryRun) {
          if (commitToState) {
            setPreview(json.data as PreviewResult);
            setOkMsg("");
            setErr("");
            setPageOkMsg("Prévia gerada.");
            setImportOpen(false);
            setPreviewOpen(true);
          }
          return json.data as PreviewResult;
        } else {
          if (commitToState) {
            setImported(json.data as ImportResult);
            setOkMsg("Importação concluída.");
            setPageOkMsg("Importação realizada com sucesso. Lista de serviços importados atualizada.");
            await persistPlanilhaUfSinapiIfMissing(String(uf || "").trim().toUpperCase());
            setImportadosReloadTick((n) => n + 1);
            setImportOpen(false);
            setPreviewOpen(false);
            setPreview(null);
            setPreviewItensLocal([]);
            setPreviewCompLocal(null);
            setPreviewSelectedCodigo("");
          }
          return json.data as ImportResult;
        }
      }

      const fd = new FormData();
      fd.append("file", file);
      fd.append("sheetName", sheetName.trim() || "Analítico");
      if (dataBaseImport.trim()) fd.append("sinapiDataBase", dataBaseImport.trim());
      if (uf.trim()) fd.append("uf", uf.trim().toUpperCase());
      fd.append("insumosModo", insumosModo);
      if (insumosSheetName.trim()) fd.append("insumosSheetName", insumosSheetName.trim());
      if (Number.isFinite(targetObraId) && targetObraId > 0) fd.append("targetObraId", String(targetObraId));
      if (computedCodigoServico) fd.append("codigoServico", computedCodigoServico);
      fd.append("mode", computedMode);
      fd.append("importAllParsed", String(computedImportAllParsed));
      fd.append("dryRun", String(dryRun));
      fd.append("forceDataBaseMismatch", String(forceDataBaseMismatch));

      const needsDirectUpload = Boolean(apiOrigin) && file.size >= 4 * 1024 * 1024;
      const uploadUrl = needsDirectUpload
        ? `${apiOrigin}/api/v1/engenharia/obras/${idObra}/planilha/sinapi/import-analitico`
        : `/api/v1/engenharia/obras/${idObra}/planilha/sinapi/import-analitico`;

      const res = await authFetch(uploadUrl, {
        method: "POST",
        body: fd,
      });
      const raw = await res.text().catch(() => "");
      let json: any = null;
      try {
        json = raw ? JSON.parse(raw) : null;
      } catch {
        json = null;
      }
      if (!res.ok || !json?.success) {
        const msg = json?.message || raw || "Falha ao processar importação SINAPI";
        throw new Error(msg);
      }

      if (dryRun) {
        if (commitToState) {
          setPreview(json.data as PreviewResult);
          setPreviewItensLocal([]);
          setPreviewCompLocal(null);
          const data = json.data as PreviewResult;
          const sampleCodes = Array.isArray(data?.sample)
            ? data.sample.map((x: any) => String(x?.codigo || "").trim().toUpperCase()).filter(Boolean)
            : [];
          if (computedCodigoServico) setPreviewSelectedCodigo(computedCodigoServico);
          else if (sampleCodes.length) setPreviewSelectedCodigo(sampleCodes[0]);
          setOkMsg("");
          setErr("");
          setPageOkMsg("Prévia gerada.");
          setImportOpen(false);
          setPreviewOpen(true);
        }
        return json.data as PreviewResult;
      } else {
        if (commitToState) {
          setImported(json.data as ImportResult);
          setOkMsg("Importação concluída.");
          setPageOkMsg("Importação realizada com sucesso. Lista de serviços importados atualizada.");
          await persistPlanilhaUfSinapiIfMissing(String(uf || "").trim().toUpperCase());
          setImportadosReloadTick((n) => n + 1);
          setImportOpen(false);
          setPreviewOpen(false);
          setPreview(null);
          setPreviewItensLocal([]);
          setPreviewCompLocal(null);
          setPreviewSelectedCodigo("");
        }
        return json.data as ImportResult;
      }
    } catch (e: any) {
      const msg = String(e?.message || "");
      if (!commitToState) throw e;
      if (msg.toLowerCase().includes("failed to fetch")) {
        setErr(
          "Falha de rede ao conectar no backend. Se você está em produção, aguarde 10 segundos e tente novamente. Se persistir, confirme se o backend (Render) está acessível e se a variável NEXT_PUBLIC_API_URL está configurada."
        );
      } else {
        setErr(msg || "Erro ao importar SINAPI");
      }
    } finally {
      if (manageBusy) setBusy(false);
    }
    return null;
  }

  async function gerarPrevia() {
    if (opcao !== "SERVICO") {
      setPreviewGeradaPorContem(false);
      await doRequest(true);
      return;
    }
    if (servicoBuscaModo === "CODIGO") {
      setPreviewGeradaPorContem(false);
      const codes = parseCodigoServicoList(codigoServico);
      if (codes.length <= 1) {
        await doRequest(true);
        return;
      }

      if (!Number.isFinite(idObra) || idObra <= 0) {
        setErr("Obra inválida.");
        return;
      }
      if (!file) {
        setErr("Selecione o arquivo XLSX do SINAPI para importar.");
        return;
      }

      setErr("");
      setOkMsg("");
      setImported(null);
      setAppliedBase(null);
      setPreview(null);
      setPreviewItensLocal([]);
      setPreviewCompLocal(null);
      setPreviewSelectedCodigo("");
      setPreviewSelectedCodigos([]);
      setPreviewItensLoadingCodigo("");
      setBusy(true);
      try {
        const mergedSample: PreviewResult["sample"] = [];
        let planilhaParams: PreviewResult["planilhaParams"] = null;
        let planilhaId: number | null = null;
        let ufOut: string | null = null;
        let sheetNameOut = String(sheetName || "").trim() || "Analítico";
        let sinapiDetected: PreviewResult["sinapiDetected"] = { dataBase: null };
        let paramsMatch: boolean | null = null;
        let paramsStatus: PreviewResult["paramsStatus"] = "UNKNOWN";
        let insumosModoOut: string | null = insumosModo;
        let parsedComposicoes = 0;
        let targetComposicoes = 0;
        let toImportComposicoes = 0;
        let toImportItens = 0;
        let skippedExisting = 0;
        let skippedNotInPlanilha = 0;

        for (const code of codes) {
          const data = (await doRequest(true, { codigoServico: code }, { commitToState: false, manageBusy: false })) as PreviewResult | null;
          if (!data) continue;
          sheetNameOut = String(data.sheetName || sheetNameOut);
          ufOut = data.uf || ufOut;
          planilhaId = data.planilhaId ?? planilhaId;
          planilhaParams = data.planilhaParams ?? planilhaParams;
          sinapiDetected = data.sinapiDetected ?? sinapiDetected;
          paramsMatch = data.paramsMatch ?? paramsMatch;
          paramsStatus = data.paramsStatus ?? paramsStatus;
          insumosModoOut = data.insumosModo ?? insumosModoOut;
          parsedComposicoes += Number(data.parsedComposicoes || 0);
          targetComposicoes += Number(data.targetComposicoes || 0);
          toImportComposicoes += Number(data.toImportComposicoes || 0);
          toImportItens += Number(data.toImportItens || 0);
          skippedExisting += Number(data.skippedExisting || 0);
          skippedNotInPlanilha += Number(data.skippedNotInPlanilha || 0);
          const sample = Array.isArray(data.sample) ? data.sample : [];
          for (const s of sample) mergedSample.push(s);
        }

        const merged: PreviewResult = {
          sheetName: sheetNameOut,
          uf: ufOut,
          planilhaId,
          planilhaParams,
          sinapiDetected,
          paramsMatch,
          paramsStatus,
          insumosModo: insumosModoOut,
          parsedComposicoes,
          targetComposicoes,
          toImportComposicoes,
          toImportItens,
          skippedExisting,
          skippedNotInPlanilha,
          sample: mergedSample,
        };

        setPreview(merged);
        setPreviewItensLocal([]);
        setPreviewCompLocal(null);
        setPreviewSelectedCodigo(codes[0]);
        setPreviewSelectedCodigos(codes);
        setPageOkMsg("Prévia gerada.");
        setImportOpen(false);
        setPreviewOpen(true);
      } catch (e: any) {
        setErr(String(e?.message || "Erro ao gerar prévia"));
      } finally {
        setBusy(false);
      }
      return;
    }

    const termo = String(descricaoServicoContem || "").trim();
    if (!termo) {
      setErr("Informe a descrição (contém).");
      return;
    }
    if (!file) {
      setErr("Selecione o arquivo XLSX do SINAPI para importar.");
      return;
    }

    setErr("");
    setOkMsg("");
    setImported(null);
    setAppliedBase(null);
    setPreview(null);
    setPreviewItensLocal([]);
    setPreviewCompLocal(null);
    setPreviewSelectedCodigo("");
    setPreviewSelectedCodigos([]);
    setPreviewItensLoadingCodigo("");
    setBusy(true);
    try {
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: "array", cellDates: false });
      const analiticoSheet = wb.Sheets[sheetName] || wb.Sheets[String(sheetName || "").trim()] || null;
      if (!analiticoSheet) {
        const names = (wb.SheetNames || []).slice(0, 30).join(", ");
        throw new Error(`Aba não encontrada: "${sheetName}". Abas disponíveis: ${names || "—"}`);
      }
      const m = XLSX.utils.sheet_to_json(analiticoSheet, { header: 1, defval: "" }) as any[][];
      if (!Array.isArray(m) || m.length < 2) throw new Error("Aba do Analítico vazia.");

      let headerIdx = -1;
      let rawHeader: any[] = [];
      for (let i = 0; i < Math.min(160, m.length); i++) {
        const r = Array.isArray(m[i]) ? m[i] : [];
        const keys = r.map((c) => normalizeHeader(String(c || ""))).filter(Boolean);
        if (keys.length < 6) continue;
        const hasComp = keys.some((k) => k.includes("codigo") && k.includes("compos"));
        const hasCodItem = keys.some((k) => k.includes("codigo") && k.includes("item"));
        const hasCoef = keys.some((k) => k.includes("coef"));
        if (hasComp && hasCodItem && hasCoef) {
          headerIdx = i;
          rawHeader = r;
          break;
        }
      }
      if (headerIdx < 0) throw new Error("Não foi possível localizar o cabeçalho da aba Analítico.");
      const headersNorm = rawHeader.map((h) => normalizeHeader(String(h || "")));
      const findCol = (cands: string[]) => {
        for (const c of cands) {
          const idx = headersNorm.findIndex((h) => h === c);
          if (idx >= 0) return idx;
        }
        for (const c of cands) {
          const idx = headersNorm.findIndex((h) => h.includes(c));
          if (idx >= 0) return idx;
        }
        return -1;
      };
      const iCodigoComp = findCol(["codigo_composicao", "codigo_da_composicao", "codigo_composicao_sinapi"]);
      const iTipo = findCol(["tipo_item", "tipo"]);
      const iCodigoItem = findCol(["codigo_item", "codigo_do_item", "codigo"]);
      const iDescItem = findCol(["descricao_item", "descricao_do_item", "descricao"]);
      const iUndItem = findCol(["unidade", "und", "unid"]);
      const iCoef = findCol(["coeficiente", "coef"]);
      const iDescComp = findCol(["descricao_da_composicao", "descricao_composicao", "desc_composicao", "descricao_compos"]);
      const iUndComp = findCol(["unidade_da_composicao", "unidade_composicao", "und_composicao", "unidade_compos", "und_compos"]);

      const termoNorm = normalizeLooseText(termo);
      const map = new Map<string, { codigo: string; descricao: string; und: string }>();
      for (let i = headerIdx + 1; i < m.length; i++) {
        const r = Array.isArray(m[i]) ? m[i] : [];
        const comp = iCodigoComp >= 0 ? String(r[iCodigoComp] || "").trim().toUpperCase() : "";
        if (!comp) continue;
        const codigoItem = iCodigoItem >= 0 ? String(r[iCodigoItem] || "").trim().toUpperCase() : "";
        const coef = iCoef >= 0 ? parseNumberLoose(r[iCoef]) : null;
        const tipoRaw = iTipo >= 0 ? String(r[iTipo] || "").trim() : "";
        const isHeaderRow = !codigoItem && coef == null && !tipoRaw;
        const desc = (iDescComp >= 0 ? String(r[iDescComp] || "").trim() : "") || (iDescItem >= 0 ? String(r[iDescItem] || "").trim() : "");
        const und = (iUndComp >= 0 ? String(r[iUndComp] || "").trim() : "") || (iUndItem >= 0 ? String(r[iUndItem] || "").trim() : "");
        const prev = map.get(comp);
        if (!prev) {
          map.set(comp, { codigo: comp, descricao: desc || "", und: und || "" });
          continue;
        }
        if (isHeaderRow) {
          map.set(comp, { codigo: comp, descricao: desc || prev.descricao, und: und || prev.und });
        }
      }

      const matches = Array.from(map.values())
        .filter((s) => s.codigo && normalizeLooseText(s.descricao).includes(termoNorm))
        .sort((a, b) => a.codigo.localeCompare(b.codigo));

      if (!matches.length) throw new Error(`Nenhum serviço encontrado contendo: "${termo}".`);

      const limit = 80;
      const limited = matches.slice(0, limit);

      const planDb = String(planilhaDataBaseSinapi || "").trim();
      const importDb = String(dataBaseImport || "").trim();
      const paramsMatch = planDb && importDb ? planDb === importDb : null;
      const paramsStatus: PreviewResult["paramsStatus"] = paramsMatch === true ? "MATCH" : paramsMatch === false ? "MISMATCH" : "UNKNOWN";

      const fakePreview: PreviewResult = {
        sheetName: String(sheetName || "").trim() || "Analítico",
        uf: String(uf || "").trim().toUpperCase() || null,
        planilhaId: planilhaCallerInfo?.idPlanilha != null ? Number(planilhaCallerInfo.idPlanilha) : null,
        planilhaParams: null,
        sinapiDetected: { dataBase: importDb || null },
        paramsMatch,
        paramsStatus,
        insumosModo,
        parsedComposicoes: limited.length,
        targetComposicoes: 0,
        toImportComposicoes: 0,
        toImportItens: 0,
        skippedExisting: 0,
        skippedNotInPlanilha: 0,
        sample: limited.map((s) => ({ codigo: s.codigo, descricao: s.descricao || null, und: s.und || null, valorSemBdi: null, itens: [] })),
      };

      setPreview(fakePreview);
      setPreviewGeradaPorContem(true);
      setPreviewSelectedCodigo(limited[0].codigo);
      setPreviewSelectedCodigos(limited.map((s) => s.codigo));
      setImportOpen(false);
      setPreviewOpen(true);
      setPageOkMsg(
        matches.length > limit
          ? `Prévia gerada: ${matches.length} serviços encontrados contendo "${termo}" (mostrando os primeiros ${limit}).`
          : `Prévia gerada: ${matches.length} serviços encontrados contendo "${termo}".`
      );
    } catch (e: any) {
      setErr(String(e?.message || "Erro ao gerar prévia"));
      setPreviewGeradaPorContem(false);
    } finally {
      setBusy(false);
    }
  }

  async function importar(codigoServicoOverride?: string) {
    const overrideCodigo = String(codigoServicoOverride || "").trim().toUpperCase();
    if (codigoServicoOverride != null && !overrideCodigo) {
      setErr("Selecione um serviço para importar.");
      return;
    }
    const computedMode: "MISSING_ONLY" | "UPSERT" = opcao === "SUBSTITUIR" || opcao === "SERVICO" ? "UPSERT" : "MISSING_ONLY";
    if (computedMode === "UPSERT") {
      const ok = window.confirm("Você escolheu atualizar/substituir composições existentes. Confirmar?");
      if (!ok) return;
    }
    if (preview && preview.paramsMatch !== true && !forceDataBaseMismatch) {
      setErr("Mês-base diferente (ou não detectado). Marque “Forçar importação (mês-base diferente)” para prosseguir.");
      return;
    }
    await doRequest(false, overrideCodigo ? { codigoServico: overrideCodigo } : undefined);
  }

  async function importarSelecionados() {
    const selected = previewSelectedCodigos.map((c) => String(c || "").trim().toUpperCase()).filter(Boolean);
    const unique = Array.from(new Set(selected));
    if (!unique.length) {
      setErr("Selecione pelo menos um serviço para importar.");
      return;
    }
    if (unique.length === 1) {
      await importar(unique[0]);
      return;
    }

    const computedMode: "MISSING_ONLY" | "UPSERT" = opcao === "SUBSTITUIR" || opcao === "SERVICO" ? "UPSERT" : "MISSING_ONLY";
    if (computedMode === "UPSERT") {
      const ok = window.confirm(`Importar ${unique.length} serviços substituindo os existentes (quando houver)?`);
      if (!ok) return;
    }
    if (preview && preview.paramsMatch !== true && !forceDataBaseMismatch) {
      setErr("Mês-base diferente (ou não detectado). Marque “Forçar importação (mês-base diferente)” para prosseguir.");
      return;
    }

    setBusy(true);
    setErr("");
    setOkMsg("");
    setImported(null);
    setAppliedBase(null);
    try {
      let importedComposicoes = 0;
      let importedItens = 0;
      let skippedExisting = 0;
      let skippedNotInPlanilha = 0;

      for (const code of unique) {
        const data = (await doRequest(false, { codigoServico: code }, { commitToState: false, manageBusy: false })) as ImportResult | null;
        if (!data) continue;
        importedComposicoes += Number(data.importedComposicoes || 0);
        importedItens += Number(data.importedItens || 0);
        skippedExisting += Number(data.skippedExisting || 0);
        skippedNotInPlanilha += Number(data.skippedNotInPlanilha || 0);
      }

      setPageOkMsg(`Importação concluída: ${unique.length} serviços • ${importedComposicoes} composições • ${importedItens} itens.`);
      setOkMsg("Importação concluída.");
      await persistPlanilhaUfSinapiIfMissing(String(uf || "").trim().toUpperCase());
      setImportadosReloadTick((n) => n + 1);

      setPreviewOpen(false);
      setPreview(null);
      setPreviewItensLocal([]);
      setPreviewCompLocal(null);
      setPreviewSelectedCodigo("");
      setPreviewSelectedCodigos([]);
    } catch (e: any) {
      setErr(String(e?.message || "Erro ao importar serviços selecionados"));
    } finally {
      setBusy(false);
    }
  }

  async function doAplicarDaBase(
    row: { codigo: string; dataBase: string; uf: string; insumosModo: string },
    opts?: { commitToState?: boolean; manageBusy?: boolean }
  ): Promise<ApplyBaseResult> {
    const commitToState = opts?.commitToState !== false;
    const manageBusy = opts?.manageBusy !== false;
    if (!Number.isFinite(idObra) || idObra <= 0) {
      if (commitToState) {
        setPageErr("Obra inválida.");
        throw new Error("Obra inválida.");
      }
      throw new Error("Obra inválida.");
    }

    if (!row?.codigo?.trim()) throw new Error("Código inválido.");

    const planDb = String(planilhaDataBaseSinapi || "").trim();
    const baseDb = String(row.dataBase || "").trim();
    if (planDb && baseDb && planDb !== baseDb && !forceDataBaseMismatch) {
      throw new Error("Mês-base diferente. Marque “Forçar importação (mês-base diferente)” para prosseguir.");
    }

    if (commitToState) {
      setPageErr("");
      setPageOkMsg("");
      setPreview(null);
      setImported(null);
      setAppliedBase(null);
    }

    if (manageBusy) setBusy(true);
    try {
      const res = await authFetch(`/api/v1/engenharia/obras/${idObra}/planilha/sinapi/aplicar-base`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          codigoServico: String(row.codigo || "").trim().toUpperCase(),
          dataBase: String(row.dataBase || "").trim(),
          uf: String(row.uf || "").trim().toUpperCase(),
          insumosModo: String(row.insumosModo || "").trim().toUpperCase(),
          targetObraId: Number.isFinite(targetObraId) && targetObraId > 0 ? targetObraId : undefined,
          mode: applySubstituirExistente ? "UPSERT" : "MISSING_ONLY",
          forceDataBaseMismatch,
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.message || "Falha ao aplicar composição já importada");
      const data = json.data as ApplyBaseResult;
      if (commitToState) {
        setAppliedBase(data);
        setPageOkMsg("Composição aplicada na obra.");
      }
      return data;
    } finally {
      if (manageBusy) setBusy(false);
    }
  }

  async function aplicarDaBase(row: { codigo: string; dataBase: string; uf: string; insumosModo: string }) {
    try {
      await doAplicarDaBase(row, { commitToState: true, manageBusy: true });
    } catch (e: any) {
      setPageErr(String(e?.message || "Erro ao aplicar composição"));
    }
  }

  async function aplicarSelecionados() {
    const rows = importadosSelectedRows;
    if (!rows.length) {
      setPageErr("Selecione um ou mais serviços para aplicar.");
      return;
    }
    setPageErr("");
    setPageOkMsg("");
    setPreview(null);
    setImported(null);
    setAppliedBase(null);
    setBusy(true);
    try {
      let importedItens = 0;
      let skipped = 0;
      let done = 0;
      for (const r of rows) {
        setPageOkMsg(`Aplicando ${done + 1}/${rows.length}…`);
        const data = await doAplicarDaBase(
          { codigo: r.codigo, dataBase: r.dataBase, uf: r.uf, insumosModo: r.insumosModo },
          { commitToState: false, manageBusy: false }
        );
        importedItens += Number(data.importedItens || 0);
        if (data.skippedExisting) skipped += 1;
        done += 1;
      }
      setPageOkMsg(`Aplicado: ${rows.length} serviços • ${importedItens} itens importados • Ignorados (já existia): ${skipped}`);
      setImportadosSelectedKeys([]);
      setAppliedBase(null);
    } catch (e: any) {
      setPageErr(String(e?.message || "Erro ao aplicar serviços selecionados"));
    } finally {
      setBusy(false);
    }
  }

  async function excluirDaBase(row: { codigo: string; dataBase: string; uf: string; insumosModo: string }) {
    const codigo = String(row.codigo || "").trim().toUpperCase();
    const dataBase = String(row.dataBase || "").trim();
    const ufRow = String(row.uf || "").trim().toUpperCase();
    const modo = String(row.insumosModo || "").trim().toUpperCase();
    if (!codigo || !dataBase || !ufRow || !modo) {
      setPageErr("Dados inválidos para excluir.");
      return;
    }
    const ok = window.confirm(
      `Excluir da base SINAPI apenas este preço da composição?\n\n${codigo} • ${dataBase} • ${ufRow} • ${modo}\n\nObs.: isso remove somente este preço (UF/modo). Outras UFs/modos permanecem.`
    );
    if (!ok) return;
    setPageErr("");
    setPageOkMsg("");
    setBusy(true);
    try {
      const qs = new URLSearchParams({ codigo, dataBase, uf: ufRow, insumosModo: modo });
      const res = await authFetch(`/api/v1/engenharia/obras/${idObra}/planilha/sinapi/importados?${qs.toString()}`, { method: "DELETE" });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.message || "Falha ao excluir da base SINAPI");
      setPageOkMsg("Preço/composição excluído da base SINAPI.");
      setImportadosReloadTick((n) => n + 1);
      setImportadosSelectedKeys((prev) => prev.filter((k) => k !== makeImportadoKey(row)));
      if (composicaoCard && String(composicaoCard.codigo || "").trim().toUpperCase() === codigo) {
        setComposicaoCard(null);
      }
    } catch (e: any) {
      setPageErr(String(e?.message || "Erro ao excluir da base SINAPI"));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!Number.isFinite(idObra) || idObra <= 0) return;
    let alive = true;
    (async () => {
      try {
        const qs = new URLSearchParams();
        if (codigoFiltro.trim()) qs.set("codigo", codigoFiltro.trim().toUpperCase());
        if (dataBaseFiltro.trim()) qs.set("dataBase", dataBaseFiltro.trim());
        if (ufFiltro.trim()) qs.set("uf", ufFiltro.trim().toUpperCase());
        if (insumosModoFiltro.trim()) qs.set("insumosModo", insumosModoFiltro.trim());
        const url = `/api/v1/engenharia/obras/${idObra}/planilha/sinapi/importados${qs.toString() ? `?${qs.toString()}` : ""}`;
        const res = await authFetch(url);
        const json = await res.json().catch(() => null);
        if (!alive) return;
        if (!res.ok || !json?.success) throw new Error(json?.message || "Falha ao carregar serviços SINAPI importados");
        const rows = Array.isArray(json?.data?.rows) ? json.data.rows : [];
        setImportados(
          rows
            .map((r: any) => ({
              codigo: String(r.codigo || "").trim(),
              descricao: String(r.descricao || ""),
              und: String(r.und || ""),
              valorComposicao: r.valorComposicao == null ? null : Number(r.valorComposicao),
              dataBase: String(r.dataBase || ""),
              uf: String(r.uf || ""),
              insumosModo: String(r.insumosModo || ""),
            }))
            .filter((r: any) => r.codigo)
        );
        setImportadosErr("");
      } catch (e: any) {
        if (!alive) return;
        setImportados([]);
        setImportadosErr(String(e?.message || "Erro ao carregar serviços SINAPI importados"));
      }
    })();
    return () => {
      alive = false;
    };
  }, [idObra, codigoFiltro, dataBaseFiltro, ufFiltro, insumosModoFiltro, importadosReloadTick]);

  useEffect(() => {
    if (!Number.isFinite(idObra) || idObra <= 0) return;
    let alive = true;
    (async () => {
      try {
        const resV = await authFetch(`/api/v1/engenharia/obras/${idObra}/planilha?view=versoes`);
        const jsonV = await resV.json().catch(() => null);
        if (!alive) return;
        if (!resV.ok || !jsonV?.success) throw new Error(jsonV?.message || "Erro ao carregar versões da planilha");
        const versoes = Array.isArray(jsonV.data?.versoes) ? jsonV.data.versoes : [];
        const atual = versoes.find((v: any) => Boolean(v.atual)) || versoes[0] || null;
        const planilhaId = planilhaIdCaller || (atual?.idPlanilha != null ? Number(atual.idPlanilha) : 0);
        if (!planilhaId) {
          setPlanilhaDataBaseSinapi("");
          setPlanilhaUfSinapi("");
          setPlanilhaCallerInfo(null);
          return;
        }
        const resP = await authFetch(`/api/v1/engenharia/obras/${idObra}/planilha?planilhaId=${planilhaId}`);
        const jsonP = await resP.json().catch(() => null);
        if (!alive) return;
        if (!resP.ok || !jsonP?.success) throw new Error(jsonP?.message || "Erro ao carregar planilha");
        const p = (jsonP.data?.planilha?.parametros || {}) as any;
        const dataBase = p?.dataBaseSinapi ? String(p.dataBaseSinapi || "") : "";
        const ufPlan = p?.ufSinapi ? String(p.ufSinapi || "").trim().toUpperCase() : "";
        const plan = jsonP.data?.planilha || null;
        setPlanilhaDataBaseSinapi(dataBase);
        setPlanilhaUfSinapi(ufPlan);
        setPlanilhaCallerInfo(
          plan
            ? { idPlanilha: Number(plan.idPlanilha || planilhaId), numeroVersao: Number(plan.numeroVersao || 0), nome: String(plan.nome || "") }
            : null
        );
      } catch {
        if (!alive) return;
        setPlanilhaDataBaseSinapi("");
        setPlanilhaUfSinapi("");
        setPlanilhaCallerInfo(null);
      }
    })();
    return () => {
      alive = false;
    };
  }, [idObra, planilhaIdCaller]);

  useEffect(() => {
    const base = String(planilhaDataBaseSinapi || "").trim();
    if (!base) return;
    if (fromImportar) {
      setDataBaseFiltro(base);
      setDataBaseImport(base);
      return;
    }
    if (String(dataBaseParam || "").trim()) return;
    setDataBaseFiltro((cur) => (String(cur || "").trim() ? cur : base));
    setDataBaseImport((cur) => (String(cur || "").trim() ? cur : base));
  }, [planilhaDataBaseSinapi, dataBaseParam, fromImportar]);

  useEffect(() => {
    const ufPlan = String(planilhaUfSinapi || "").trim().toUpperCase();
    if (!ufPlan) return;
    if (fromImportar) {
      setUf(ufPlan);
      setUfFiltro(ufPlan);
      return;
    }
    setUfFiltro((cur) => (String(cur || "").trim() ? cur : ufPlan));
  }, [planilhaUfSinapi, fromImportar]);

  useEffect(() => {
    const ufPlan = String(planilhaUfSinapi || "").trim().toUpperCase();
    if (ufPlan) return;
    if (!fromImportar) return;
    const ufLocal = String(uf || "").trim().toUpperCase();
    if (!ufLocal) return;
    setUfFiltro((cur) => (String(cur || "").trim() ? cur : ufLocal));
  }, [planilhaUfSinapi, fromImportar, uf]);

  useEffect(() => {
    if (codigoParam) {
      setCodigoServico(codigoParam);
      setCodigoFiltro(codigoParam);
      setOpcao("SERVICO");
    }
  }, [codigoParam]);

  useEffect(() => {
    if (dataBaseParam) setDataBaseFiltro(dataBaseParam);
  }, [dataBaseParam]);

  useEffect(() => {
    if (!Number.isFinite(idObra) || idObra <= 0) return;
    setTargetObraId((cur) => (Number.isFinite(cur) && cur > 0 ? cur : idObra));
  }, [idObra]);

  useEffect(() => {
    setInsumosSheetName((cur) => {
      const norm = String(cur || "").trim().toUpperCase();
      if (!norm) return cur;
      if (norm === "ISD" || norm === "ICD" || norm === "ISE") return insumosModo;
      return cur;
    });
  }, [insumosModo]);

  useEffect(() => {
    if (!Number.isFinite(idObra) || idObra <= 0) return;
    let alive = true;
    (async () => {
      try {
        const res = await authFetch(`/api/v1/engenharia/obras/lista`);
        const json = await res.json().catch(() => null);
        if (!alive) return;
        if (!res.ok || !json?.success) throw new Error(json?.message || "Falha ao carregar obras");
        const rows = Array.isArray(json?.data?.rows) ? json.data.rows : [];
        const list = rows
          .map((r: any) => ({
            idObra: r.idObra == null ? 0 : Number(r.idObra),
            nomeObra: String(r.nomeObra || ""),
            numeroContrato: r.numeroContrato == null ? null : String(r.numeroContrato || ""),
          }))
          .filter((r: any) => Number(r.idObra) > 0);
        setObrasLista(list);
      } catch {
        if (!alive) return;
        setObrasLista([]);
      }
    })();
    return () => {
      alive = false;
    };
  }, [idObra]);

  return (
    <div className="p-4 md:p-6 space-y-6 w-full max-w-none text-slate-900">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex-1 min-w-[260px]">
          <div className="text-xs text-slate-500">{breadcrumb}</div>
          <h1 className="text-2xl font-semibold">Sinapi</h1>
          <div className="mt-1 text-sm text-slate-700">
            <div>
              OBRA: {idObra} - {obraContrato?.nomeObra ? obraContrato.nomeObra : `Obra #${idObra}`}
            </div>
            <div>
              CONTRATO: {obraContrato?.idContrato != null ? obraContrato.idContrato : "—"} - {obraContrato?.objeto ? obraContrato.objeto : "—"}
            </div>
            <div>
              PLANILHA: {planilhaCallerInfo?.idPlanilha != null ? planilhaCallerInfo.idPlanilha : "—"} -{" "}
              {(() => {
                if (planilhaCallerInfo?.numeroVersao) return `Versão ${planilhaCallerInfo.numeroVersao}`;
                const nome = String(planilhaCallerInfo?.nome || "").trim();
                const cleaned = nome
                  .replace(/\(csv\)/gi, "")
                  .replace(/\bv\s*\d+\s*-\s*/gi, "")
                  .replace(/\s+/g, " ")
                  .trim();
                if (cleaned) return cleaned;
                return "—";
              })()}
            </div>
            <div>
              SINAPI (planilha): {planilhaDataBaseSinapi || "—"} • UF: {planilhaUfSinapi || ufFiltro || uf || "—"}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-500 disabled:opacity-60"
            type="button"
            onClick={() => {
              setOkMsg("");
              setErr("");
              setDataBaseImport((cur) => (String(cur || "").trim() ? cur : String(planilhaDataBaseSinapi || "").trim()));
              setImportOpen(true);
            }}
            disabled={busy}
            title="Abrir opções de importação"
          >
            Importar
          </button>
          <button
            className="rounded-lg border bg-white px-4 py-2 text-sm hover:bg-slate-50 disabled:opacity-60"
            type="button"
            onClick={() => {
              const href = String(backHref || "").trim();
              const isExternal = href.startsWith("//") || /^(?:[a-z][a-z0-9+.-]*:)?\/\//i.test(href) || /^[a-z][a-z0-9+.-]*:/i.test(href);
              if (isExternal) return router.push(`/dashboard/engenharia/obras/${idObra}/planilha`);
              if (!href) return router.push(`/dashboard/engenharia/obras/${idObra}/planilha`);
              router.push(href);
            }}
            disabled={busy}
            title="Voltar"
          >
            Voltar
          </button>
        </div>
      </div>

      {pageOkMsg ? <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">{pageOkMsg}</div> : null}
      {pageErr ? <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{pageErr}</div> : null}

      {showTelaConfig ? (
        <section className="rounded-xl border bg-white p-4 shadow-sm space-y-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="text-lg font-semibold">Configuração de tela</div>
            <button
              className="rounded-lg border bg-white px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-60"
              type="button"
              onClick={() => setShowTelaConfig(false)}
              disabled={busy}
            >
              Fechar
            </button>
          </div>
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <div className="rounded-lg border bg-slate-50 p-3">
            <div className="text-sm font-semibold text-slate-800">Colunas</div>
            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={telaPrefs.colCodigo} onChange={(e) => setTelaPrefs((p) => ({ ...p, colCodigo: Boolean(e.target.checked) }))} disabled={busy} />
                <span>Código</span>
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={telaPrefs.colDescricao}
                  onChange={(e) => setTelaPrefs((p) => ({ ...p, colDescricao: Boolean(e.target.checked) }))}
                  disabled={busy}
                />
                <span>Descrição</span>
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={telaPrefs.colUnd} onChange={(e) => setTelaPrefs((p) => ({ ...p, colUnd: Boolean(e.target.checked) }))} disabled={busy} />
                <span>Unidade</span>
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={telaPrefs.colValor} onChange={(e) => setTelaPrefs((p) => ({ ...p, colValor: Boolean(e.target.checked) }))} disabled={busy} />
                <span>Valor</span>
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={telaPrefs.colUf} onChange={(e) => setTelaPrefs((p) => ({ ...p, colUf: Boolean(e.target.checked) }))} disabled={busy} />
                <span>UF</span>
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={telaPrefs.colDataBase}
                  onChange={(e) => setTelaPrefs((p) => ({ ...p, colDataBase: Boolean(e.target.checked) }))}
                  disabled={busy}
                />
                <span>Data-base</span>
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={telaPrefs.colInsumosModo}
                  onChange={(e) => setTelaPrefs((p) => ({ ...p, colInsumosModo: Boolean(e.target.checked) }))}
                  disabled={busy}
                />
                <span>Preços de insumos</span>
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={telaPrefs.colAcoes} onChange={(e) => setTelaPrefs((p) => ({ ...p, colAcoes: Boolean(e.target.checked) }))} disabled={busy} />
                <span>Ações</span>
              </label>
            </div>
          </div>

          <div className="rounded-lg border bg-slate-50 p-3">
            <div className="text-sm font-semibold text-slate-800">Largura das colunas (px)</div>
            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
              <div className="space-y-1">
                <div className="text-xs text-slate-600">Código</div>
                <input
                  className="input bg-white w-[90px]"
                  type="number"
                  value={telaPrefs.wCodigoPx}
                  onChange={(e) => setTelaPrefs((p) => ({ ...p, wCodigoPx: Number(e.target.value || 0) }))}
                  disabled={busy}
                />
              </div>
              <div className="space-y-1">
                <div className="text-xs text-slate-600">Descrição</div>
                <input
                  className="input bg-white w-[90px]"
                  type="number"
                  value={telaPrefs.wDescricaoPx}
                  onChange={(e) => setTelaPrefs((p) => ({ ...p, wDescricaoPx: Number(e.target.value || 0) }))}
                  disabled={busy}
                />
              </div>
              <div className="space-y-1">
                <div className="text-xs text-slate-600">Unidade</div>
                <input
                  className="input bg-white w-[90px]"
                  type="number"
                  value={telaPrefs.wUndPx}
                  onChange={(e) => setTelaPrefs((p) => ({ ...p, wUndPx: Number(e.target.value || 0) }))}
                  disabled={busy}
                />
              </div>
              <div className="space-y-1">
                <div className="text-xs text-slate-600">Valor</div>
                <input
                  className="input bg-white w-[90px]"
                  type="number"
                  value={telaPrefs.wValorPx}
                  onChange={(e) => setTelaPrefs((p) => ({ ...p, wValorPx: Number(e.target.value || 0) }))}
                  disabled={busy}
                />
              </div>
              <div className="space-y-1">
                <div className="text-xs text-slate-600">UF</div>
                <input className="input bg-white w-[90px]" type="number" value={telaPrefs.wUfPx} onChange={(e) => setTelaPrefs((p) => ({ ...p, wUfPx: Number(e.target.value || 0) }))} disabled={busy} />
              </div>
              <div className="space-y-1">
                <div className="text-xs text-slate-600">Data-base</div>
                <input
                  className="input bg-white w-[90px]"
                  type="number"
                  value={telaPrefs.wDataBasePx}
                  onChange={(e) => setTelaPrefs((p) => ({ ...p, wDataBasePx: Number(e.target.value || 0) }))}
                  disabled={busy}
                />
              </div>
              <div className="space-y-1">
                <div className="text-xs text-slate-600">Preços de insumos</div>
                <input
                  className="input bg-white w-[90px]"
                  type="number"
                  value={telaPrefs.wInsumosModoPx}
                  onChange={(e) => setTelaPrefs((p) => ({ ...p, wInsumosModoPx: Number(e.target.value || 0) }))}
                  disabled={busy}
                />
              </div>
              <div className="space-y-1">
                <div className="text-xs text-slate-600">Ações</div>
                <input className="input bg-white w-[90px]" type="number" value={telaPrefs.wAcoesPx} onChange={(e) => setTelaPrefs((p) => ({ ...p, wAcoesPx: Number(e.target.value || 0) }))} disabled={busy} />
              </div>
            </div>
          </div>
        </div>
        </section>
      ) : null}

      <section className="rounded-xl border bg-white p-4 shadow-sm space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="text-lg font-semibold">Serviços SINAPI importados</div>
          <div className="flex items-center gap-2">
            <button
              className="rounded-lg border bg-white px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-60"
              type="button"
              onClick={() => {
                setCodigoFiltro("");
                setDataBaseFiltro("");
                setUfFiltro("");
                setInsumosModoFiltro("");
              }}
              disabled={busy}
              title="Limpar filtros"
            >
              Limpar filtros
            </button>
            <button
              className="rounded-lg border bg-white px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-60"
              type="button"
              onClick={() => setShowTelaConfig((v) => !v)}
              disabled={busy}
            >
              Configurar tela
            </button>
            <button
              className="rounded-lg border bg-white px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-60"
              type="button"
              onClick={() => setShowFiltros((v) => !v)}
              disabled={busy}
            >
              {showFiltros ? "Ocultar filtros" : "Exibir filtros"}
            </button>
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={applySubstituirExistente} onChange={(e) => setApplySubstituirExistente(Boolean(e.target.checked))} disabled={busy} />
          <span>Ao aplicar na obra: substituir existente (padrão)</span>
        </label>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            className="rounded-lg bg-blue-600 px-3 py-2 text-sm text-white hover:bg-blue-500 disabled:opacity-60"
            type="button"
            onClick={() => aplicarSelecionados()}
            disabled={busy || !importadosSelectedRows.length}
            title={!importadosSelectedRows.length ? "Selecione um ou mais serviços para aplicar" : "Aplicar serviços selecionados na planilha"}
          >
            Aplicar selecionados ({importadosSelectedRows.length})
          </button>
          <button
            className="rounded-lg border bg-white px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-60"
            type="button"
            onClick={() => setImportadosSelectedKeys(importados.map((r) => makeImportadoKey(r)))}
            disabled={busy || !importados.length}
            title="Selecionar todos os serviços exibidos"
          >
            Selecionar todos
          </button>
          <button
            className="rounded-lg border bg-white px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-60"
            type="button"
            onClick={() => setImportadosSelectedKeys([])}
            disabled={busy || !importadosSelectedKeys.length}
            title="Limpar seleção"
          >
            Limpar seleção
          </button>
        </div>
        {(() => {
          const filtrosAtivos: string[] = [];
          const cod = String(codigoFiltro || "").trim();
          const db = String(dataBaseFiltro || "").trim();
          const ufF = String(ufFiltro || "").trim();
          const modo = String(insumosModoFiltro || "").trim();
          if (cod) filtrosAtivos.push(`Código=${cod.toUpperCase()}`);
          if (db) filtrosAtivos.push(`Data-base=${db}`);
          if (ufF) filtrosAtivos.push(`UF=${ufF.toUpperCase()}`);
          if (modo) filtrosAtivos.push(`Preços=${modo}`);
          if (!filtrosAtivos.length) return null;
          return <div className="rounded border bg-amber-50 p-2 text-sm text-amber-900">Dados filtrados: {filtrosAtivos.join(" • ")}</div>;
        })()}

        {importadosErr ? <div className="rounded border border-red-200 bg-red-50 p-2 text-sm text-red-700">{importadosErr}</div> : null}

        {showFiltros ? (
          <div className="rounded-lg border bg-slate-50 p-3">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-12">
              <div className="md:col-span-3 space-y-1">
                <div className="text-sm text-slate-600">Código</div>
                <input className="input bg-white" value={codigoFiltro} onChange={(e) => setCodigoFiltro(e.target.value)} disabled={busy} placeholder="Ex: 100309" />
              </div>
              <div className="md:col-span-3 space-y-1">
                <div className="text-sm text-slate-600">Data-base</div>
                <input
                  className="input bg-white"
                  value={dataBaseFiltro}
                  onChange={(e) => setDataBaseFiltro(e.target.value)}
                  disabled={busy}
                  placeholder={planilhaDataBaseSinapi || "Ex: 04/2025"}
                />
              </div>
              <div className="md:col-span-2 space-y-1">
                <div className="text-sm text-slate-600">UF</div>
                <input className="input bg-white" value={ufFiltro} onChange={(e) => setUfFiltro(e.target.value)} disabled={busy} list="ufs" />
              </div>
              <div className="md:col-span-4 space-y-1">
                <div className="text-sm text-slate-600">Preços de insumos</div>
                <select className="input bg-white" value={insumosModoFiltro} onChange={(e) => setInsumosModoFiltro(e.target.value as any)} disabled={busy}>
                  <option value="">(todos)</option>
                  <option value="ISD">ISD — Encargos sociais SEM desoneração</option>
                  <option value="ICD">ICD — Encargos sociais COM desoneração</option>
                  <option value="ISE">ISE — Sem encargos sociais</option>
                </select>
              </div>
              <div className="md:col-span-12 text-xs text-slate-600">
                Data-base da planilha (SINAPI): {planilhaDataBaseSinapi || "—"} {dataBaseFiltro.trim() ? `• Filtro: ${dataBaseFiltro.trim()}` : ""}{" "}
                {planilhaDataBaseSinapi && dataBaseFiltro.trim() ? (planilhaDataBaseSinapi.trim() === dataBaseFiltro.trim() ? "• Compatível" : "• Diferente") : ""}
              </div>
            </div>
          </div>
        ) : null}

        {importados.length ? (
          <div className="rounded-lg border overflow-hidden">
            <div className="hidden md:block overflow-x-auto">
              <div style={{ minWidth: importadosLayout.minWidthPx }}>
                <div className="grid bg-slate-50 text-xs font-semibold text-slate-700" style={{ gridTemplateColumns: importadosLayout.gridTemplateColumns }}>
                  {importadosLayout.cols.map((c) => (
                    <div
                      key={c.key}
                      className={`px-2 py-2 border-r last:border-r-0 ${c.align === "right" ? "text-right" : c.align === "center" ? "text-center" : ""}`}
                    >
                      {c.key === "__sel" ? (
                        <input
                          type="checkbox"
                          checked={Boolean(importados.length) && importados.every((r) => importadosSelectedSet.has(makeImportadoKey(r)))}
                          onChange={(e) => {
                            const checked = Boolean(e.target.checked);
                            if (checked) setImportadosSelectedKeys(importados.map((r) => makeImportadoKey(r)));
                            else setImportadosSelectedKeys([]);
                          }}
                          disabled={busy || !importados.length}
                          title="Selecionar todos"
                        />
                      ) : (
                        c.label
                      )}
                    </div>
                  ))}
                </div>
                <div className="divide-y bg-white">
                  {importados.map((r) => (
                    <div
                      key={`${r.dataBase}:${r.uf}:${r.insumosModo}:${r.codigo}`}
                      className="grid text-sm"
                      style={{ gridTemplateColumns: importadosLayout.gridTemplateColumns }}
                      onDoubleClick={() => abrirComposicaoDoImportado({ codigo: r.codigo, dataBase: r.dataBase, uf: r.uf, insumosModo: r.insumosModo })}
                      role="button"
                      tabIndex={0}
                    >
                      <div className="px-2 py-2 border-r last:border-r-0 flex items-center justify-center">
                        <input
                          type="checkbox"
                          checked={importadosSelectedSet.has(makeImportadoKey(r))}
                          onChange={(e) => {
                            const checked = Boolean(e.target.checked);
                            const key = makeImportadoKey(r);
                            setImportadosSelectedKeys((prev) => {
                              const cur = Array.isArray(prev) ? prev : [];
                              const has = cur.includes(key);
                              if (checked && !has) return [...cur, key];
                              if (!checked && has) return cur.filter((k) => k !== key);
                              return cur;
                            });
                          }}
                          disabled={busy}
                          title="Selecionar"
                        />
                      </div>
                      {telaPrefs.colCodigo ? <div className="px-2 py-2 border-r last:border-r-0 text-center">{r.codigo}</div> : null}
                      {telaPrefs.colDescricao ? <div className="px-2 py-2 border-r last:border-r-0">{r.descricao}</div> : null}
                      {telaPrefs.colUnd ? <div className="px-2 py-2 border-r last:border-r-0 text-center">{r.und}</div> : null}
                      {telaPrefs.colValor ? (
                        <div className="px-2 py-2 border-r last:border-r-0 text-right">
                          {r.valorComposicao == null ? "—" : Number(r.valorComposicao).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                        </div>
                      ) : null}
                      {telaPrefs.colUf ? <div className="px-2 py-2 border-r last:border-r-0 text-center">{r.uf || "—"}</div> : null}
                      {telaPrefs.colDataBase ? <div className="px-2 py-2 border-r last:border-r-0 text-center">{r.dataBase || "—"}</div> : null}
                      {telaPrefs.colInsumosModo ? <div className="px-2 py-2 border-r last:border-r-0 text-center">{r.insumosModo || "—"}</div> : null}
                      {telaPrefs.colAcoes ? (
                        <div className="px-2 py-2 flex items-center justify-center">
                          <button
                            className="rounded border bg-white p-2 text-xs hover:bg-slate-50 disabled:opacity-60 inline-flex items-center"
                            type="button"
                            disabled={busy}
                            onClick={() => excluirDaBase({ codigo: r.codigo, dataBase: r.dataBase, uf: r.uf, insumosModo: r.insumosModo })}
                            title="Excluir da base SINAPI"
                            aria-label="Excluir da base SINAPI"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                          <button
                            className="rounded border bg-white p-2 text-xs hover:bg-slate-50 disabled:opacity-60 inline-flex items-center"
                            type="button"
                            disabled={busy}
                            onClick={() => aplicarDaBase({ codigo: r.codigo, dataBase: r.dataBase, uf: r.uf, insumosModo: r.insumosModo })}
                            title="Aplicar na planilha"
                            aria-label="Aplicar na planilha"
                          >
                            <ArrowLeft className="h-4 w-4" />
                          </button>
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="md:hidden divide-y bg-white">
              {importados.map((r) => (
                <div
                  key={`${r.dataBase}:${r.uf}:${r.insumosModo}:${r.codigo}`}
                  className="p-3 space-y-2 text-sm"
                  onDoubleClick={() => abrirComposicaoDoImportado({ codigo: r.codigo, dataBase: r.dataBase, uf: r.uf, insumosModo: r.insumosModo })}
                >
                  <label className="flex items-center gap-2 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={importadosSelectedSet.has(makeImportadoKey(r))}
                      onChange={(e) => {
                        const checked = Boolean(e.target.checked);
                        const key = makeImportadoKey(r);
                        setImportadosSelectedKeys((prev) => {
                          const cur = Array.isArray(prev) ? prev : [];
                          const has = cur.includes(key);
                          if (checked && !has) return [...cur, key];
                          if (!checked && has) return cur.filter((k) => k !== key);
                          return cur;
                        });
                      }}
                      disabled={busy}
                    />
                    <span>Selecionar</span>
                  </label>
                  {telaPrefs.colCodigo ? (
                    <div>
                      <div className="text-xs text-slate-500">Código</div>
                      <div className="font-mono">{r.codigo || "—"}</div>
                    </div>
                  ) : null}
                  {telaPrefs.colDescricao ? (
                    <div>
                      <div className="text-xs text-slate-500">Descrição</div>
                      <div className="text-slate-800">{r.descricao || "—"}</div>
                    </div>
                  ) : null}
                  <div className="grid grid-cols-2 gap-2">
                    {telaPrefs.colUnd ? (
                      <div>
                        <div className="text-xs text-slate-500">Unidade</div>
                        <div>{r.und || "—"}</div>
                      </div>
                    ) : null}
                    {telaPrefs.colValor ? (
                      <div>
                        <div className="text-xs text-slate-500">Valor</div>
                        <div className="tabular-nums">
                          {r.valorComposicao == null ? "—" : Number(r.valorComposicao).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                        </div>
                      </div>
                    ) : null}
                    {telaPrefs.colUf ? (
                      <div>
                        <div className="text-xs text-slate-500">UF</div>
                        <div>{r.uf || "—"}</div>
                      </div>
                    ) : null}
                    {telaPrefs.colDataBase ? (
                      <div>
                        <div className="text-xs text-slate-500">Data-base</div>
                        <div>{r.dataBase || "—"}</div>
                      </div>
                    ) : null}
                    {telaPrefs.colInsumosModo ? (
                      <div className="col-span-2">
                        <div className="text-xs text-slate-500">Preços de insumos</div>
                        <div>{r.insumosModo || "—"}</div>
                      </div>
                    ) : null}
                  </div>
                  {telaPrefs.colAcoes ? (
                    <div className="flex justify-end">
                      <button
                        className="rounded border bg-white p-2 text-xs hover:bg-slate-50 disabled:opacity-60 inline-flex items-center"
                        type="button"
                        disabled={busy}
                        onClick={() => excluirDaBase({ codigo: r.codigo, dataBase: r.dataBase, uf: r.uf, insumosModo: r.insumosModo })}
                        title="Excluir da base SINAPI"
                        aria-label="Excluir da base SINAPI"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                      <button
                        className="rounded border bg-white p-2 text-xs hover:bg-slate-50 disabled:opacity-60 inline-flex items-center"
                        type="button"
                        disabled={busy}
                        onClick={() => aplicarDaBase({ codigo: r.codigo, dataBase: r.dataBase, uf: r.uf, insumosModo: r.insumosModo })}
                        title="Aplicar na planilha"
                        aria-label="Aplicar na planilha"
                      >
                        <ArrowLeft className="h-4 w-4" />
                      </button>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="text-sm text-slate-600">Nenhum serviço SINAPI importado ainda.</div>
        )}
      </section>

      {composicaoErr ? <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{composicaoErr}</div> : null}
      {composicaoBusy && !composicaoCard ? <div className="text-sm text-slate-600">Carregando composição…</div> : null}
      {composicaoCard ? (
        <section className="rounded-xl border bg-white p-4 shadow-sm space-y-3">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="min-w-[260px]">
              <div className="text-lg font-semibold">Composição do serviço</div>
              <div className="mt-1 text-sm text-slate-700">
                <div className="font-mono text-xs text-slate-600">{composicaoCard.codigo}</div>
                <div className="text-slate-900">{composicaoCard.descricao || "—"}</div>
                <div className="text-xs text-slate-600">
                  un: {composicaoCard.und || "—"} • {composicaoCard.dataBase || "—"} • {composicaoCard.uf || "—"} • {composicaoCard.insumosModo || "—"}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="text-sm text-slate-700">
                Total (sem BDI):{" "}
                <span className="tabular-nums font-semibold">
                  {composicaoCard.valorSemBdi == null
                    ? "—"
                    : Number(composicaoCard.valorSemBdi).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                </span>
              </div>
              <button className="rounded-lg border bg-white px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-60" type="button" onClick={() => setComposicaoCard(null)} disabled={busy}>
                Fechar
              </button>
            </div>
          </div>

          <div className="rounded-lg border overflow-hidden">
            <div className="overflow-x-auto">
                <div className="min-w-[1140px]">
                  <div className="grid grid-cols-[140px_140px_120px_1fr_60px_120px_140px_140px] bg-slate-50 text-xs font-semibold text-slate-700">
                    <div className="px-2 py-2 border-r">Tipo Item (SINAPI)</div>
                    <div className="px-2 py-2 border-r">Tipo (sistema)</div>
                  <div className="px-2 py-2 border-r">Código</div>
                  <div className="px-2 py-2 border-r">Descrição</div>
                  <div className="px-2 py-2 border-r text-center">un</div>
                  <div className="px-2 py-2 border-r text-right">Coef.</div>
                  <div className="px-2 py-2 border-r text-right">V. unit</div>
                  <div className="px-2 py-2 text-right">Valor</div>
                </div>
                <div className="divide-y bg-white">
                  {(composicaoCard.itens || []).map((it, idx) => (
                      <div key={`${it.codigoItem}-${idx}`} className="grid grid-cols-[140px_140px_120px_1fr_60px_120px_140px_140px] text-sm">
                        <div className="px-2 py-2 border-r">{it.tipoItem || "—"}</div>
                        <div className="px-2 py-2 border-r">
                          {(() => {
                            const tipoItemSinapi = String(it.tipoItem || "").trim().toUpperCase();
                            const classificacao = it.classificacao == null ? "" : String(it.classificacao || "").trim();
                            if (tipoItemSinapi === "COMPOSICAO" || tipoItemSinapi === "COMPOSICAO_AUXILIAR") return "COMPOSICAO";
                            if (tipoItemSinapi === "INSUMO") return classificacao || "INSUMO";
                            return classificacao || tipoItemSinapi || "—";
                          })()}
                        </div>
                      <div className="px-2 py-2 border-r font-mono text-xs">{it.codigoItem || "—"}</div>
                      <div className="px-2 py-2 border-r">{it.descricao || "—"}</div>
                      <div className="px-2 py-2 border-r text-center">{it.und || "—"}</div>
                      <div className="px-2 py-2 border-r text-right tabular-nums">{it.coeficiente == null ? "—" : Number(it.coeficiente).toLocaleString("pt-BR")}</div>
                      <div className="px-2 py-2 border-r text-right tabular-nums">
                        {it.valorUnitario == null ? "—" : Number(it.valorUnitario).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                      </div>
                      <div className="px-2 py-2 text-right tabular-nums">
                        {it.valor == null ? "—" : Number(it.valor).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {composicaoBusy ? <div className="text-sm text-slate-600">Atualizando composição…</div> : null}
        </section>
      ) : null}

      {appliedBase ? (
        <section className="rounded-xl border bg-white p-4 shadow-sm space-y-3">
          <div className="text-lg font-semibold">Aplicado na obra</div>
          <div className="text-sm text-slate-700">
            {appliedBase.codigoServico} • {appliedBase.dataBase} • {appliedBase.uf} • {appliedBase.insumosModo}
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 text-sm">
            <div className="rounded border bg-slate-50 p-3">
              <div className="text-[11px] text-slate-500">Itens importados</div>
              <div className="mt-1 font-semibold">{Number(appliedBase.importedItens || 0).toLocaleString("pt-BR")}</div>
            </div>
            <div className="rounded border bg-slate-50 p-3">
              <div className="text-[11px] text-slate-500">Modo</div>
              <div className="mt-1 font-semibold">{appliedBase.mode}</div>
            </div>
            <div className="rounded border bg-slate-50 p-3">
              <div className="text-[11px] text-slate-500">Já existia</div>
              <div className="mt-1 font-semibold">{appliedBase.skippedExisting ? "Sim" : "Não"}</div>
            </div>
          </div>
        </section>
      ) : null}

      {importOpen ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 overflow-auto">
          <div className="w-full max-w-5xl rounded-xl border bg-white shadow-sm">
            <div className="flex items-center justify-between gap-3 border-b p-4">
              <div className="text-lg font-semibold">Opções de importação</div>
            </div>

            <div className="p-4 space-y-4">
              {okMsg ? <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">{okMsg}</div> : null}
              {err ? <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div> : null}
              <div className="rounded-xl border bg-white p-4 shadow-sm">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-12">
                  <div className="md:col-span-7 space-y-4">
                    <div className="space-y-1">
                      <div className="text-sm text-slate-600">Data-base (SINAPI)</div>
                      <input
                        className="input bg-white"
                        value={dataBaseImport}
                        onChange={(e) => setDataBaseImport(e.target.value)}
                        disabled={busy}
                        placeholder={planilhaDataBaseSinapi || "Ex: 04/2025"}
                      />
                      <div className="text-xs text-slate-500">
                        Padrão da obra: {planilhaDataBaseSinapi || "—"} (pode ser alterado manualmente)
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-3 md:grid-cols-12">
                      <div className="md:col-span-7 space-y-1">
                        <div className="text-sm text-slate-600">Aba (Relatório Analítico de Composições)</div>
                        <input className="input bg-white" value={sheetName} onChange={(e) => setSheetName(e.target.value)} disabled={busy} placeholder="Analítico" />
                      </div>
                      <div className="md:col-span-5 space-y-1">
                        <div className="text-sm text-slate-600">UF</div>
                        <select className="input bg-white w-full sm:w-[92px]" value={uf} onChange={(e) => setUf(e.target.value)} disabled={busy}>
                          {ufs.map((x) => (
                            <option key={x} value={x}>
                              {x}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="text-sm text-slate-600">Preços de insumos</div>
                      <select className="input bg-white" value={insumosModo} onChange={(e) => setInsumosModo(e.target.value as any)} disabled={busy}>
                        <option value="ISD">ISD — Encargos sociais SEM desoneração</option>
                        <option value="ICD">ICD — Encargos sociais COM desoneração</option>
                        <option value="ISE">ISE — Sem encargos sociais</option>
                      </select>
                      <div className="space-y-1">
                        <div className="text-xs text-slate-500">Nome da aba (preços de insumos)</div>
                        <input
                          className="input bg-white"
                          value={insumosSheetName}
                          onChange={(e) => setInsumosSheetName(e.target.value)}
                          disabled={busy}
                          placeholder={insumosModo}
                        />
                        <div className="text-xs text-slate-500">Deixe em branco para o sistema localizar automaticamente.</div>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="text-sm text-slate-600">Arquivo XLSX</div>
                      <div className="flex items-center justify-between gap-3 flex-wrap">
                        <div className="flex items-center gap-2 min-w-[240px]">
                          {file ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <XCircle className="h-4 w-4 text-red-600" />}
                          <div className="text-sm text-slate-700 truncate max-w-[320px]">{file ? String(file.name || "") : "Nenhum arquivo selecionado"}</div>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                          {lastXlsxReady ? (
                            <button
                              className="rounded-lg border bg-white px-4 py-2 text-sm hover:bg-slate-50 disabled:opacity-60"
                              type="button"
                              onClick={usarUltimoXlsx}
                              disabled={busy}
                              title={lastXlsxName ? `Usar último: ${lastXlsxName}` : "Usar último XLSX"}
                            >
                              Usar último XLSX
                            </button>
                          ) : null}
                          <button
                            className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-500 disabled:opacity-60"
                            type="button"
                            onClick={selecionarXlsx}
                            disabled={busy}
                          >
                            Selecionar arquivo XLSX
                          </button>
                        </div>
                        <input
                          ref={fileInputRef}
                          className="hidden"
                          type="file"
                          accept=".xlsx"
                          onChange={(e) => {
                            const f = e.target.files?.[0] || null;
                            setFile(f);
                            resetSelectedFile();
                            try {
                              setLastXlsxName(String(f?.name || ""));
                              localStorage.setItem("exp:sinapi:lastXlsxName", String(f?.name || ""));
                            } catch {}
                          }}
                          disabled={busy}
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="text-sm text-slate-600">Opções</div>
                      <label className="flex items-center gap-2 text-sm">
                        <input type="radio" name="opcao" checked={opcao === "FALTAM"} onChange={() => setOpcao("FALTAM")} disabled={busy} />
                        <span>Importar somente as composições que faltam na obra</span>
                      </label>
                      <label className="flex items-center gap-2 text-sm">
                        <input type="radio" name="opcao" checked={opcao === "SUBSTITUIR"} onChange={() => setOpcao("SUBSTITUIR")} disabled={busy} />
                        <span>Atualizar/substituir composições existentes na obra</span>
                      </label>
                      <label className="flex items-center gap-2 text-sm">
                        <input type="radio" name="opcao" checked={opcao === "SERVICO"} onChange={() => setOpcao("SERVICO")} disabled={busy} />
                        <span>Selecionar um serviço</span>
                      </label>
                      {opcao === "SERVICO" ? (
                        <div className="mt-1">
                          <div className="text-xs text-slate-500">Buscar por</div>
                          <div className="mt-1 flex items-center gap-3 flex-wrap text-sm">
                            <label className="flex items-center gap-2">
                              <input
                                type="radio"
                                name="servicoBuscaModo"
                                checked={servicoBuscaModo === "CODIGO"}
                                onChange={() => {
                                  setServicoBuscaModo("CODIGO");
                                  setDescricaoServicoContem("");
                                }}
                                disabled={busy}
                              />
                              <span>Código do serviço</span>
                            </label>
                            <label className="flex items-center gap-2">
                              <input
                                type="radio"
                                name="servicoBuscaModo"
                                checked={servicoBuscaModo === "CONTEM"}
                                onChange={() => {
                                  setServicoBuscaModo("CONTEM");
                                  setCodigoServico("");
                                }}
                                disabled={busy}
                              />
                              <span>Descrição contém</span>
                            </label>
                          </div>

                          {servicoBuscaModo === "CODIGO" ? (
                            <div className="mt-2">
                              <div className="text-xs text-slate-500">Código do serviço</div>
                              <input
                                className="input bg-white mt-1"
                                value={codigoServico}
                                onChange={(e) => setCodigoServico(e.target.value)}
                                disabled={busy}
                                placeholder="Ex: 95393 ou 95393,10052,25645"
                              />
                            </div>
                          ) : (
                            <div className="mt-2">
                              <div className="text-xs text-slate-500">Descrição contém</div>
                              <input
                                className="input bg-white mt-1"
                                value={descricaoServicoContem}
                                onChange={(e) => setDescricaoServicoContem(e.target.value)}
                                disabled={busy}
                                placeholder='Ex: Alvenaria'
                              />
                            </div>
                          )}
                        </div>
                      ) : null}
                      <label className="flex items-center gap-2 text-sm">
                        <input type="radio" name="opcao" checked={opcao === "ARQUIVO"} onChange={() => setOpcao("ARQUIVO")} disabled={busy} />
                        <span>Importar TODAS as composições encontradas no arquivo</span>
                      </label>

                      {opcao === "FALTAM" || opcao === "SUBSTITUIR" ? (
                        <div className="mt-2">
                          <div className="text-xs text-slate-500">Obra/Licitação/Orçamento</div>
                          <select
                            className="input bg-white mt-1"
                            value={String(targetObraId || idObra)}
                            onChange={(e) => setTargetObraId(Number(e.target.value || 0))}
                            disabled={busy}
                          >
                            {obrasLista.length ? (
                              obrasLista.map((o) => (
                                <option key={o.idObra} value={o.idObra}>
                                  #{o.idObra} - {o.nomeObra} - {o.numeroContrato || "—"}
                                </option>
                              ))
                            ) : (
                              <option value={idObra}>#{idObra} - Obra #{idObra} - —</option>
                            )}
                          </select>
                        </div>
                      ) : null}
                    </div>

                    <label className="flex items-center gap-2 text-sm rounded border bg-white px-3 py-2">
                      <input type="checkbox" checked={forceDataBaseMismatch} onChange={(e) => setForceDataBaseMismatch(Boolean(e.target.checked))} disabled={busy} />
                      <span className="text-slate-700">Forçar importação (mês-base diferente)</span>
                    </label>
                  </div>

                  <div className="md:col-span-5">
                    <div className="rounded-xl border bg-slate-50 p-3">
                      <div className="text-sm font-semibold text-slate-800">Checklist interno da importação</div>
                      <div className="mt-1 text-xs text-slate-600">Mostra o que o sistema valida e executa internamente (principalmente ao gerar a Prévia).</div>
                      <div className="mt-3 space-y-2">
                        {checklistInterno.map((it, idx) => (
                          <div key={`${idx}:${it.titulo}`} className="flex items-start gap-2 text-sm">
                            {it.status === "OK" ? (
                              <CheckCircle2 className="h-4 w-4 text-emerald-600 mt-0.5" />
                            ) : it.status === "PENDENTE" ? (
                              <XCircle className="h-4 w-4 text-red-600 mt-0.5" />
                            ) : (
                              <div className="h-4 w-4 mt-0.5 rounded-full border border-slate-300 bg-white" />
                            )}
                            <div className="min-w-0">
                              <div className="text-slate-800">{it.titulo}</div>
                              {it.status === "NA_PREVIA" ? <div className="text-xs text-slate-500">Executa ao clicar em “Prévia”.</div> : null}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="md:col-span-12 flex items-center justify-end gap-2 flex-wrap border-t pt-3">
                    <button
                      className="rounded-lg border bg-white px-4 py-2 text-sm hover:bg-slate-50 disabled:opacity-60"
                      type="button"
                      onClick={() => {
                        setImportOpen(false);
                        setOkMsg("");
                        setErr("");
                      }}
                      disabled={busy}
                    >
                      Fechar
                    </button>
                    <button
                      className="rounded-lg border bg-white px-4 py-2 text-sm hover:bg-slate-50 disabled:opacity-60"
                      type="button"
                      onClick={() => gerarPrevia()}
                      disabled={busy || !previewRequirements.ok}
                      title={
                        busy ? "Processando..." : previewRequirements.ok ? "Gerar prévia" : `Preencha: ${previewRequirements.missing.join(", ")}`
                      }
                    >
                      Prévia
                    </button>
                  </div>
                </div>
              </div>

              {imported ? (
                <section className="rounded-xl border bg-white p-4 shadow-sm space-y-2">
                  <div className="text-lg font-semibold">Resultado</div>
                  <div className="text-sm text-slate-700">
                    Importadas {imported.importedComposicoes} composições e {imported.importedItens} itens.
                  </div>
                </section>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {previewOpen && preview ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 overflow-auto">
          <div className="w-full max-w-6xl rounded-xl border bg-white shadow-sm">
            <div className="flex items-center justify-between gap-3 border-b p-4">
              <div className="text-lg font-semibold">Prévia</div>
              <button
                className="rounded-lg border bg-white px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-60"
                type="button"
                onClick={() => {
                  setPreviewOpen(false);
                  setPreview(null);
                  setPreviewItensLocal([]);
                  setPreviewCompLocal(null);
                  setPreviewSelectedCodigo("");
                  setPreviewSelectedCodigos([]);
                  setPreviewGeradaPorContem(false);
                  setPreviewItensLoadingCodigo("");
                  setImported(null);
                  setOkMsg("");
                  setErr("");
                }}
                disabled={busy}
              >
                Fechar
              </button>
            </div>

            <div className="p-4 space-y-4">
              {err ? <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div> : null}

              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-[240px] text-sm text-slate-700">
                  Clique em um serviço para conferir os itens. Marque “Sel” para escolher quais serviços serão importados (pode selecionar vários).
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    className="rounded-lg border bg-white px-4 py-2 text-sm hover:bg-slate-50 disabled:opacity-60"
                    type="button"
                    onClick={() => {
                      setPreviewOpen(false);
                      setPreview(null);
                      setPreviewItensLocal([]);
                      setPreviewCompLocal(null);
                      setPreviewSelectedCodigo("");
                      setPreviewSelectedCodigos([]);
                      setPreviewGeradaPorContem(false);
                      setPreviewItensLoadingCodigo("");
                      setImported(null);
                      setOkMsg("");
                      setErr("");
                    }}
                    disabled={busy}
                  >
                    Cancelar
                  </button>
                  <button
                    className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-500 disabled:opacity-60"
                    type="button"
                    onClick={() => importarSelecionados()}
                    disabled={busy || !previewSelectedCodigos.length}
                    title={!previewSelectedCodigos.length ? "Selecione um ou mais serviços para importar" : "Importar serviços selecionados"}
                  >
                    Importar selecionados ({previewSelectedCodigos.length})
                  </button>
                </div>
              </div>

              <div className="rounded-lg border bg-slate-50 p-3 text-sm">
                <div className="font-semibold text-slate-700">Parâmetros</div>
                <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
                  <div className="rounded border bg-white px-3 py-2">
                    <div className="text-[11px] text-slate-500">Data-base (Planilha/SINAPI)</div>
                    <div className="text-sm font-semibold">
                      {preview.planilhaParams?.dataBaseSinapi ? preview.planilhaParams.dataBaseSinapi : "—"} {" / "}
                      {preview.sinapiDetected?.dataBase ? preview.sinapiDetected.dataBase : "—"}
                    </div>
                  </div>
                  <div className="rounded border bg-white px-3 py-2">
                    <div className="text-[11px] text-slate-500">Parâmetros compatíveis</div>
                    <div className="text-sm font-semibold">{preview.paramsMatch == null ? "—" : preview.paramsMatch ? "Sim" : "Não"}</div>
                  </div>
                  <div className="rounded border bg-white px-3 py-2">
                    <div className="text-[11px] text-slate-500">Preços de insumos</div>
                    <div className="text-sm font-semibold">{preview.insumosModo ? String(preview.insumosModo) : insumosModo}</div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4 text-sm">
                <div className="rounded border bg-slate-50 p-3">
                  <div className="text-[11px] text-slate-500">Composições no arquivo</div>
                  <div className="mt-1 font-semibold">{Number(preview.parsedComposicoes || 0).toLocaleString("pt-BR")}</div>
                </div>
                <div className="rounded border bg-slate-50 p-3">
                  <div className="text-[11px] text-slate-500">Alvo (planilha atual)</div>
                  <div className="mt-1 font-semibold">{Number(preview.targetComposicoes || 0).toLocaleString("pt-BR")}</div>
                </div>
                <div className="rounded border bg-slate-50 p-3">
                  <div className="text-[11px] text-slate-500">A importar</div>
                  <div className="mt-1 font-semibold">{Number(preview.toImportComposicoes || 0).toLocaleString("pt-BR")}</div>
                </div>
                <div className="rounded border bg-slate-50 p-3">
                  <div className="text-[11px] text-slate-500">Itens a importar</div>
                  <div className="mt-1 font-semibold">{Number(preview.toImportItens || 0).toLocaleString("pt-BR")}</div>
                </div>
              </div>

              <div className="space-y-3">
                <div className="rounded-lg border overflow-hidden">
                  <div className="bg-slate-50 px-3 py-2 text-sm font-semibold">Serviços na prévia</div>
                  <div className="max-h-72 overflow-y-auto">
                    <div className="overflow-x-auto">
                      <div className="min-w-[720px]">
                        <div className="grid grid-cols-[46px_46px_110px_1fr_60px_160px] gap-x-2 border-b bg-white px-3 py-2 text-[11px] font-semibold text-slate-600">
                          <div className="text-center">Sel</div>
                          <div className="text-center">Imp.</div>
                          <div>Código</div>
                          <div>Serviço</div>
                          <div>Un</div>
                          <div className="text-right">Valor sem BDI</div>
                        </div>
                        <div className="divide-y bg-white">
                          {previewComposicoesParaLista.map((c, idx) => {
                            const codigo = String(c.codigo || "").trim().toUpperCase();
                            const focused = Boolean(codigo) && codigo === String(previewSelectedCodigo || "").trim().toUpperCase();
                            const selected = Boolean(codigo) && previewSelectedCodigos.includes(codigo);
                            const jaImportado = codigo ? importadosCodes.has(codigo) : false;
                            const valor = c.valorSemBdi == null ? null : Number(c.valorSemBdi);
                            const valorOk = valor != null && Number.isFinite(valor);
                            const descServico = c.descricao == null ? "" : String(c.descricao).trim();
                            return (
                              <button
                                key={codigo || `row-${idx}`}
                                type="button"
                                className={`w-full text-left grid grid-cols-[46px_46px_110px_1fr_60px_160px] gap-x-2 px-3 py-2 text-sm hover:bg-slate-50 ${focused ? "bg-blue-50" : ""}`}
                                onClick={() => (codigo ? setPreviewSelectedCodigo(codigo) : null)}
                                disabled={busy || !codigo}
                              >
                                <div className="flex items-center justify-center">
                                  <input
                                    type="checkbox"
                                    checked={selected}
                                    onChange={() => {
                                      if (!codigo) return;
                                      setPreviewSelectedCodigo(codigo);
                                      setPreviewSelectedCodigos((prev) => {
                                        const cur = Array.isArray(prev) ? prev : [];
                                        const has = cur.includes(codigo);
                                        if (has) return cur.filter((x) => x !== codigo);
                                        return [...cur, codigo];
                                      });
                                    }}
                                    disabled={busy || !codigo}
                                  />
                                </div>
                                <div className="flex items-center justify-center">
                                  <span
                                    className={
                                      jaImportado
                                        ? "inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-100 text-emerald-700"
                                        : "inline-flex h-5 w-5 items-center justify-center rounded-full bg-slate-100 text-slate-500"
                                    }
                                    title={jaImportado ? "Já importado" : "Não importado"}
                                  >
                                    {jaImportado ? "✓" : "—"}
                                  </span>
                                </div>
                                <div className="font-mono text-xs text-slate-700">{codigo || "—"}</div>
                                <div className="text-slate-800 leading-snug">{descServico || "—"}</div>
                                <div className="text-slate-700">{c.und || "—"}</div>
                                <div className="text-right tabular-nums text-slate-800">
                                  {valorOk ? Number(valor).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—"}
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {previewItensDoSelecionado.length ? (
                  <div className="rounded-lg border overflow-hidden">
                    <div className="bg-slate-50 px-3 py-2 text-sm font-semibold">Itens da prévia (confira antes de importar)</div>
                    <div className="max-h-72 overflow-auto">
                      <div className="overflow-x-auto">
                        <div className="min-w-[1040px]">
                          <div className="grid grid-cols-[110px_110px_110px_1fr_60px_110px_120px_120px] gap-x-2 border-b bg-white px-3 py-2 text-[11px] font-semibold text-slate-600">
                            <div>Tipo Item (SINAPI)</div>
                            <div>Tipo (sistema)</div>
                            <div>Código</div>
                            <div>Descrição</div>
                            <div>Un</div>
                            <div className="text-right">Coeficiente</div>
                            <div className="text-right">V. unit</div>
                            <div className="text-right">Valor</div>
                          </div>
                          <div className="divide-y bg-white">
                            {previewItensDoSelecionado.map((it, idx) => {
                              const q = Number(it.coeficiente || 0);
                              const vu = it.valorUnitario == null ? null : Number(it.valorUnitario);
                              const valor = vu == null || !Number.isFinite(vu) || !Number.isFinite(q) ? null : vu * q;
                              return (
                                <div
                                  key={`${idx}:${it.codigoItem}`}
                                  className="grid grid-cols-[110px_110px_110px_1fr_60px_110px_120px_120px] gap-x-2 px-3 py-2 text-sm"
                                >
                                  <div className="text-xs text-slate-700">{it.tipoItemSinapi || "—"}</div>
                                  <div className="text-xs text-slate-700">{it.tipoSistema || "—"}</div>
                                  <div className="font-mono text-xs text-slate-700">{it.codigoItem}</div>
                                  <div className="text-slate-800">{it.descricao || "—"}</div>
                                  <div className="text-slate-700">{it.und || "—"}</div>
                                  <div className="text-right tabular-nums text-slate-800">{Number(it.coeficiente || 0).toLocaleString("pt-BR")}</div>
                                  <div className="text-right tabular-nums text-slate-800">
                                    {it.valorUnitario == null ? "—" : Number(it.valorUnitario).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                                  </div>
                                  <div className="text-right tabular-nums text-slate-800">
                                    {valor == null ? "—" : Number(valor).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-lg border bg-slate-50 px-3 py-3 text-sm text-slate-700">Nenhum item na prévia para o serviço selecionado.</div>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <datalist id="ufs">
        {ufs.map((x) => (
          <option key={x} value={x} />
        ))}
      </datalist>
    </div>
  );
}
