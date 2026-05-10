"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Download } from "lucide-react";
import { PageLoadStatusBadge } from "@/components/PageLoadStatus";

type VersaoRow = {
  idPlanilha: number;
  numeroVersao: number;
  nome: string;
  atual: boolean;
  idFonteDados: number | null;
  idParametros: number | null;
  fonteNome: string;
  parametrosNome: string;
  idObra?: number | null;
  obraNome?: string | null;
};

type LinhaServico = {
  tipoLinha: "ITEM" | "SUBITEM" | "SERVICO";
  item: string;
  codigo: string;
  fonte: string;
  servicos: string;
  und: string;
  quant: string;
  valorUnitario: string;
};

function parseNumberLoose(v: unknown) {
  const raw = String(v ?? "").trim();
  if (!raw) return null;
  let norm = raw.replace(/\s+/g, "");
  const hasComma = norm.includes(",");
  const hasDot = norm.includes(".");
  if (hasComma && hasDot) {
    if (norm.lastIndexOf(",") > norm.lastIndexOf(".")) {
      norm = norm.replace(/\./g, "");
      norm = norm.replace(/,/g, ".");
    } else {
      norm = norm.replace(/,/g, "");
    }
  } else if (hasComma) {
    norm = norm.replace(/,/g, ".");
  } else {
    const parts = norm.split(".");
    if (parts.length > 2) norm = norm.replace(/\./g, "");
  }
  norm = norm.replace(/[^\d.\-]/g, "");
  if (!norm) return null;
  const n = Number(norm);
  return Number.isFinite(n) ? n : null;
}

function toDec(v: unknown) {
  return parseNumberLoose(v);
}

function normalizeHeader(h: string) {
  return String(h || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function splitCsvLine(line: string, sep: string) {
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
          continue;
        }
        inQuotes = false;
        continue;
      }
      cur += ch;
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
  return out;
}

function parseCsvTextAuto(text: string) {
  const raw = String(text || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  if (!raw) return { headers: [] as string[], rows: [] as string[][] };
  const lines = raw.split("\n").filter((l) => String(l).trim() !== "");
  if (lines.length < 2) return { headers: [] as string[], rows: [] as string[][] };
  const first = lines[0];
  const commaCount = (first.match(/,/g) || []).length;
  const semiCount = (first.match(/;/g) || []).length;
  const sep = semiCount >= commaCount ? ";" : ",";
  const headers = splitCsvLine(first, sep).map((h) => String(h || "").trim());
  const rows = lines.slice(1).map((l) => splitCsvLine(l, sep));
  return { headers, rows };
}

function detectTipoLinha(item: string, codigo: string, und: string, quant: string, valorUnit: string) {
  const hasServ = !!(String(codigo || "").trim() || String(und || "").trim() || String(quant || "").trim() || String(valorUnit || "").trim());
  if (hasServ) return { tipo: "SERVICO" as const, nivel: item.trim() ? Math.max(0, item.split(".").filter(Boolean).length) : 0 };
  const parts = item.trim() ? item.split(".").filter(Boolean) : [];
  if (parts.length <= 1) return { tipo: "ITEM" as const, nivel: parts.length };
  return { tipo: "SUBITEM" as const, nivel: parts.length };
}

async function readTextSmart(file: File) {
  const buf = await file.arrayBuffer();
  const u8 = new Uint8Array(buf);
  const utf8 = new TextDecoder("utf-8", { fatal: false }).decode(u8);
  const latin1 = new TextDecoder("windows-1252", { fatal: false }).decode(u8);
  const score = (t: string) => {
    const replacement = (t.match(/\uFFFD/g) || []).length;
    const mojibake = (t.match(/[ÃÂ]/g) || []).length;
    return replacement * 10 + mojibake;
  };
  const text = score(utf8) <= score(latin1) ? utf8 : latin1;
  return text.replace(/^\uFEFF/, "");
}

export default function PlanilhaImportacoesPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const search = useSearchParams();
  const idObra = Number(params?.id || 0);
  const planilhaIdFromQs = search.get("planilhaId");
  const returnTo = search.get("returnTo");
  const targetLocked = Boolean(String(planilhaIdFromQs || "").trim());

  const safeReturnTo = useMemo(() => {
    const raw = String(returnTo || "").trim();
    const isExternal = raw.startsWith("//") || /^(?:[a-z][a-z0-9+.-]*:)?\/\//i.test(raw) || /^[a-z][a-z0-9+.-]*:/i.test(raw);
    return raw && !isExternal ? raw : null;
  }, [returnTo]);

  const [loading, setLoading] = useState(false);
  const [bootLoading, setBootLoading] = useState(false);
  const [bootDone, setBootDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  const [versoes, setVersoes] = useState<VersaoRow[]>([]);
  const [targetPlanilhaId, setTargetPlanilhaId] = useState<string>(planilhaIdFromQs ? String(planilhaIdFromQs) : "");
  const [planilhasOutrasObras, setPlanilhasOutrasObras] = useState<VersaoRow[]>([]);
  const [includeOutrasObras, setIncludeOutrasObras] = useState(false);

  const selectedTarget = useMemo(() => {
    const id = Number(String(targetPlanilhaId || "").trim() || 0);
    if (!id) return null;
    return versoes.find((v) => Number(v.idPlanilha) === id) || null;
  }, [targetPlanilhaId, versoes]);

  const [importMode, setImportMode] = useState<"CSV" | "PLANILHA">("CSV");
  const [csvMode, setCsvMode] = useState<"APPEND" | "REPLACE">("APPEND");
  const [csvCatalogDupPolicy, setCsvCatalogDupPolicy] = useState<"FILL" | "KEEP" | "OVERWRITE">("FILL");
  const [csvSkipExistingLines, setCsvSkipExistingLines] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [csvPreview, setCsvPreview] = useState<{
    file: File | null;
    rows: Array<{
      checked: boolean;
      rowIndex: number;
      item: string;
      codigo: string;
      fonte: string;
      servicos: string;
      und: string;
      quant: string;
      valorUnitario: string;
      tipoLinha: "ITEM" | "SUBITEM" | "SERVICO";
      errors: Partial<Record<"item" | "codigo" | "servicos" | "und" | "quant" | "valorUnitario" | "tipoLinha", string>>;
    }>;
    missingColumns: string[];
  }>({ file: null, rows: [], missingColumns: [] });

  const [planilhaImportMode, setPlanilhaImportMode] = useState<"APPEND" | "REPLACE">("APPEND");
  const [planilhaSkipExistingLines, setPlanilhaSkipExistingLines] = useState(false);
  const [sourcePlanilhaId, setSourcePlanilhaId] = useState<string>("");
  const [sourceRows, setSourceRows] = useState<Array<{ checked: boolean; r: LinhaServico }>>([]);
  const planilhaCatalogDupPolicy: "KEEP" = "KEEP";

  const catalogPolicyTooltip = useMemo(() => {
    const map = {
      FILL: "Completa campos que estiverem vazios na Fonte (ex.: descrição/UND). Não apaga nem troca dados já preenchidos.",
      KEEP: "Se o código já existe na Fonte, mantém exatamente como está e ignora o que vier na importação para esse código.",
      OVERWRITE: "Se o código já existe na Fonte, atualiza os campos informados na importação. Campos vazios na importação não substituem os atuais.",
    } as const;
    return (p: "FILL" | "KEEP" | "OVERWRITE") => map[p];
  }, []);

  async function authFetch(input: RequestInfo | URL, init?: RequestInit) {
    let token: string | null = null;
    try {
      if (typeof window !== "undefined") token = localStorage.getItem("token");
    } catch {}
    const apiOrigin = String(process.env.NEXT_PUBLIC_API_URL || "").trim().replace(/\/$/, "");
    const rawUrl = typeof input === "string" ? input : input instanceof URL ? input.toString() : String(input);
    const url = /^https?:\/\//i.test(rawUrl) ? rawUrl : apiOrigin ? `${apiOrigin}${rawUrl.startsWith("/") ? "" : "/"}${rawUrl}` : rawUrl;
    return fetch(url, {
      ...init,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(init?.headers || {}),
      },
      cache: "no-store",
    });
  }

  async function carregarVersoes() {
    try {
      setErr(null);
      const res = await authFetch(`/api/v1/engenharia/obras/${idObra}/planilha?view=versoes-min`);
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.message || "Erro ao carregar versões");
      const list = Array.isArray(json.data?.versoes) ? (json.data.versoes as any[]) : [];
      const normalized: VersaoRow[] = list.map((v) => ({
        idPlanilha: Number(v.idPlanilha),
        numeroVersao: Number(v.numeroVersao),
        nome: String(v.nome || ""),
        atual: Boolean(v.atual),
        idFonteDados: v.idFonteDados == null ? null : Number(v.idFonteDados),
        idParametros: v.idParametros == null ? null : Number(v.idParametros),
        fonteNome: String(v.fonteNome || ""),
        parametrosNome: String(v.parametrosNome || ""),
        idObra: v.idObra == null ? null : Number(v.idObra),
        obraNome: v.obraNome == null ? null : String(v.obraNome || ""),
      }));
      setVersoes(normalized);
      if (!targetPlanilhaId) {
        const current = normalized.find((x) => x.atual) || normalized[0] || null;
        if (current) setTargetPlanilhaId(String(current.idPlanilha));
      }
    } catch (e: any) {
      setErr(e?.message || "Erro ao carregar versões");
      setVersoes([]);
    }
  }

  async function carregarPlanilhasDeOutrasObras() {
    try {
      setErr(null);
      const res = await authFetch(`/api/v1/engenharia/planilhas/versoes`);
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.message || "Erro ao carregar planilhas");
      const list = Array.isArray(json.data?.versoes) ? (json.data.versoes as any[]) : [];
      const normalized: VersaoRow[] = list.map((v) => ({
        idPlanilha: Number(v.idPlanilha),
        numeroVersao: Number(v.numeroVersao),
        nome: String(v.nome || ""),
        atual: Boolean(v.atual),
        idFonteDados: v.idFonteDados == null ? null : Number(v.idFonteDados),
        idParametros: v.idParametros == null ? null : Number(v.idParametros),
        fonteNome: String(v.fonteNome || ""),
        parametrosNome: String(v.parametrosNome || ""),
        idObra: v.idObra == null ? null : Number(v.idObra),
        obraNome: v.obraNome == null ? null : String(v.obraNome || ""),
      }));
      setPlanilhasOutrasObras(normalized);
    } catch (e: any) {
      setPlanilhasOutrasObras([]);
      setErr(e?.message || "Erro ao carregar planilhas");
    }
  }

  function baixarModeloCsv() {
    const sep = ";";
    const lines = [
      ["item", "codigo", "fonte", "servicos", "und", "quant", "valor_unitario", "tipo_linha"].join(sep),
      ["1", "", "", "ADMINISTRAÇÃO GERAL DA OBRA", "", "", "", "ITEM"].join(sep),
      ["1.1", "COMP.UPA.155", "PROPRIO", "ADMINISTRAÇÃO TÉCNICA E GERAL DA OBRA", "%", "100", "3540,99", "SERVICO"].join(sep),
      ["2", "", "", "CANTEIRO DE OBRA", "", "", "", "ITEM"].join(sep),
      ["2.1", "COMP.JOS 07", "PROPRIO", "SINAPI (REF: 93207_12/2023) - EXECUCAO DE ESCRITORIO...", "m2", "12", "926,76", "SERVICO"].join(sep),
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

  async function prepararCsvPreview(file: File) {
    try {
      setErr(null);
      setOkMsg(null);
      const text = await readTextSmart(file);
      const { headers, rows } = parseCsvTextAuto(text);
      if (!headers.length || !rows.length) {
        setCsvPreview({ file: null, rows: [], missingColumns: [] });
        setErr("CSV vazio ou inválido.");
        return;
      }
      const idx: Record<string, number> = Object.fromEntries(headers.map((h, i) => [normalizeHeader(h), i]));
      const required = ["item", "codigo", "fonte", "servicos", "und", "quant", "valor_unitario"];
      const missingColumns = required.filter((k) => idx[k] == null);
      const get = (r: string[], key: string) => String(r[idx[key]] ?? "").trim();

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
        const tipoLinhaFromCsv =
          tipoLinhaNorm === "ITEM" || tipoLinhaNorm === "SUBITEM" || tipoLinhaNorm === "SERVICO" ? (tipoLinhaNorm as any) : "";
        const det = tipoLinhaFromCsv ? { tipo: tipoLinhaFromCsv, nivel: 0 } : detectTipoLinha(item, codigo, und, quant, valorUnitario);
        const quantidade = toDec(quant);
        const vUnit = toDec(valorUnitario);

        const errors: any = {};
        if (!item.trim()) errors.item = "Obrigatório";
        if (tipoLinhaNorm && !tipoLinhaFromCsv) errors.tipoLinha = "tipo_linha inválido";
        if (det.tipo === "SERVICO") {
          if (!servicos.trim()) errors.servicos = "Obrigatório (serviço)";
          if (!codigo.trim()) errors.codigo = "Obrigatório (serviço)";
          if (!und.trim()) errors.und = "Obrigatório (serviço)";
          if (quantidade == null || !(quantidade > 0)) errors.quant = "Inválido (serviço)";
          if (vUnit == null || !(vUnit >= 0)) errors.valorUnitario = "Inválido (serviço)";
        } else {
          if (codigo.trim()) errors.codigo = "Não usar em ITEM/SUBITEM";
          if (und.trim()) errors.und = "Não usar em ITEM/SUBITEM";
          if (quant.trim()) errors.quant = "Não usar em ITEM/SUBITEM";
          if (valorUnitario.trim()) errors.valorUnitario = "Não usar em ITEM/SUBITEM";
        }
        return { rowIndex: i, item, codigo, fonte, servicos, und, quant, valorUnitario, tipoLinha: det.tipo, errors };
      });
      setCsvPreview({ file, rows: mapped.map((x) => ({ checked: true, ...x })), missingColumns });
    } catch (e: any) {
      setCsvPreview({ file: null, rows: [], missingColumns: [] });
      setErr(e?.message || "Erro ao ler CSV.");
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  const csvHasBlockingErrors = useMemo(() => {
    if (!csvPreview.file) return false;
    if (csvPreview.missingColumns.length) return true;
    return csvPreview.rows.some((r) => r.checked && Object.keys(r.errors || {}).length > 0);
  }, [csvPreview]);

  useEffect(() => {
    if (csvMode === "REPLACE" && csvSkipExistingLines) setCsvSkipExistingLines(false);
  }, [csvMode, csvSkipExistingLines]);

  useEffect(() => {
    if (planilhaImportMode === "REPLACE" && planilhaSkipExistingLines) setPlanilhaSkipExistingLines(false);
  }, [planilhaImportMode, planilhaSkipExistingLines]);

  async function confirmarImportacaoCsv() {
    const idPlanilha = Number(String(targetPlanilhaId || "").trim() || 0);
    if (!idPlanilha) {
      setErr("Selecione a planilha destino.");
      return;
    }
    if (!csvPreview.file) {
      setErr("Selecione um CSV.");
      return;
    }
    if (!csvPreview.rows.some((r) => r.checked)) {
      setErr("Selecione ao menos 1 linha para importar.");
      return;
    }
    try {
      const warnings: string[] = [];
      if (csvMode === "REPLACE") warnings.push("Você escolheu SUBSTITUIR: todas as linhas da planilha destino serão apagadas antes de importar.");
      if (csvCatalogDupPolicy === "OVERWRITE")
        warnings.push("Você escolheu SOBRESCREVER na Fonte: serviços com o mesmo código serão atualizados na Fonte de dados (cadastro compartilhado) e isso pode impactar outras planilhas.");
      if (warnings.length) {
        const ok = window.confirm(`${warnings.join("\n\n")}\n\nDeseja continuar?`);
        if (!ok) return;
      }
      setLoading(true);
      setErr(null);
      setOkMsg(null);
      const form = new FormData();
      form.append("action", "IMPORTAR_CSV");
      form.append("idPlanilha", String(idPlanilha));
      form.append("modoImportacao", csvMode);
      form.append("catalogDupPolicy", csvCatalogDupPolicy);
      form.append("skipExistingLines", csvSkipExistingLines ? "1" : "0");
      const selected = csvPreview.rows.filter((r) => r.checked).map((r) => r.rowIndex);
      form.append("selectedRowIndexes", JSON.stringify(selected));
      form.append("file", csvPreview.file);
      const res = await authFetch(`/api/v1/engenharia/obras/${idObra}/planilha`, { method: "POST", body: form });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.message || "Erro ao importar CSV");
      setOkMsg("Importação CSV concluída.");
      setCsvPreview({ file: null, rows: [], missingColumns: [] });
    } catch (e: any) {
      setErr(e?.message || "Erro ao importar CSV");
    } finally {
      setLoading(false);
    }
  }

  async function carregarServicosDaPlanilha() {
    const srcId = Number(String(sourcePlanilhaId || "").trim() || 0);
    if (!srcId) return;
    const src = [...versoes, ...planilhasOutrasObras].find((v) => Number(v.idPlanilha) === srcId) || null;
    const idObraSource = src?.idObra != null && Number(src.idObra) > 0 ? Number(src.idObra) : idObra;
    try {
      setLoading(true);
      setErr(null);
      setOkMsg(null);
      const res = await authFetch(`/api/v1/engenharia/obras/${idObraSource}/planilha?planilhaId=${encodeURIComponent(String(srcId))}`);
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.message || "Erro ao carregar planilha origem");
      const linhas = Array.isArray(json.data?.planilha?.linhas) ? (json.data.planilha.linhas as any[]) : [];
      const itemKey = (s: string) => String(s || "").trim();
      const itemParts = (s: string) =>
        itemKey(s)
          .split(".")
          .map((p) => p.trim())
          .filter(Boolean)
          .map((p) => {
            const n = Number(p);
            return Number.isFinite(n) ? n : p;
          });
      const tipoOrder = (t: string) => {
        const tt = String(t || "").trim().toUpperCase();
        if (tt === "ITEM") return 0;
        if (tt === "SUBITEM") return 1;
        return 2;
      };
      const all = linhas
        .map((l) => ({
          tipoLinha: (String(l.tipoLinha || "").trim().toUpperCase() || "ITEM") as any,
          item: String(l.item || "").trim(),
          codigo: String(l.codigo || "").trim(),
          fonte: String(l.fonte || "").trim(),
          servicos: String(l.servicos || l.servico || l.observacao || "").trim(),
          und: String(l.und || "").trim(),
          quant: String(l.quant || "").trim(),
          valorUnitario: String(l.valorUnitario || "").trim(),
        }))
        .filter((l) => l.item || l.codigo || l.servicos);
      all.sort((a, b) => {
        const ap = itemParts(a.item);
        const bp = itemParts(b.item);
        const len = Math.max(ap.length, bp.length);
        for (let i = 0; i < len; i++) {
          const av = ap[i];
          const bv = bp[i];
          if (av == null && bv == null) break;
          if (av == null) return -1;
          if (bv == null) return 1;
          if (typeof av === "number" && typeof bv === "number") {
            if (av !== bv) return av - bv;
          } else {
            const as = String(av);
            const bs = String(bv);
            if (as !== bs) return as.localeCompare(bs, "pt-BR");
          }
        }
        const to = tipoOrder(a.tipoLinha) - tipoOrder(b.tipoLinha);
        if (to) return to;
        const ac = String(a.codigo || "");
        const bc = String(b.codigo || "");
        if (ac !== bc) return ac.localeCompare(bc, "pt-BR");
        return 0;
      });
      setSourceRows(all.map((r) => ({ checked: true, r })));
    } catch (e: any) {
      setErr(e?.message || "Erro ao carregar planilha origem");
      setSourceRows([]);
    } finally {
      setLoading(false);
    }
  }

  async function confirmarImportacaoPlanilha() {
    const idPlanilhaTarget = Number(String(targetPlanilhaId || "").trim() || 0);
    const idPlanilhaSource = Number(String(sourcePlanilhaId || "").trim() || 0);
    if (!idPlanilhaTarget) {
      setErr("Selecione a planilha destino.");
      return;
    }
    if (!idPlanilhaSource) {
      setErr("Selecione a planilha origem.");
      return;
    }
    const selected = sourceRows.filter((x) => x.checked).map((x) => x.r);
    if (!selected.length) {
      setErr("Selecione ao menos 1 linha para importar.");
      return;
    }
    try {
      const warnings: string[] = [];
      if (planilhaImportMode === "REPLACE") warnings.push("Você escolheu SUBSTITUIR: todas as linhas da planilha destino serão apagadas antes de importar.");
      if (warnings.length) {
        const ok = window.confirm(`${warnings.join("\n\n")}\n\nDeseja continuar?`);
        if (!ok) return;
      }
      setLoading(true);
      setErr(null);
      setOkMsg(null);
      const res = await authFetch(`/api/v1/engenharia/obras/${idObra}/planilha`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "IMPORTAR_SERVICOS_DE_OUTRA_PLANILHA",
          idPlanilhaTarget,
          idPlanilhaSource,
          modoImportacao: planilhaImportMode,
          catalogDupPolicy: planilhaCatalogDupPolicy,
          skipExistingLines: planilhaSkipExistingLines,
          rows: selected,
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.message || "Erro ao importar serviços da planilha");
      setOkMsg("Importação concluída.");
    } catch (e: any) {
      setErr(e?.message || "Erro ao importar serviços da planilha");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!idObra) return;
    setBootLoading(true);
    setBootDone(false);
    void carregarVersoes().finally(() => {
      setBootLoading(false);
      setBootDone(true);
    });
  }, [idObra]);

  useEffect(() => {
    if (!targetLocked) return;
    const id = String(planilhaIdFromQs || "").trim();
    if (id) setTargetPlanilhaId(id);
  }, [planilhaIdFromQs, targetLocked]);

  useEffect(() => {
    if (!includeOutrasObras) return;
    if (planilhasOutrasObras.length) return;
    void carregarPlanilhasDeOutrasObras();
  }, [includeOutrasObras, planilhasOutrasObras.length]);

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-7xl text-slate-900">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="text-xs text-slate-500">Engenharia → Obras → Planilha orçamentária → Importações</div>
          <h1 className="text-2xl font-semibold">Importações</h1>
          <div className="text-sm text-slate-600">Importe Itens, subitens e serviços a partir de CSV ou de outra planilha.</div>
          {selectedTarget ? <div className="text-sm font-semibold text-slate-800">{`#${selectedTarget.idPlanilha} - ${selectedTarget.nome || "—"}`}</div> : null}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <PageLoadStatusBadge loading={bootLoading || loading} done={bootDone && !bootLoading && !loading} />
          <button className="rounded-lg border bg-white px-4 py-2 text-sm hover:bg-slate-50 disabled:opacity-60" type="button" onClick={carregarVersoes} disabled={loading}>
            Atualizar
          </button>
          <button
            className="rounded-lg border bg-white px-4 py-2 text-sm hover:bg-slate-50 disabled:opacity-60"
            type="button"
            onClick={() => router.push(safeReturnTo || `/dashboard/engenharia/obras/${idObra}/planilha`)}
            disabled={loading}
          >
            Voltar
          </button>
        </div>
      </div>

      {okMsg ? <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">{okMsg}</div> : null}
      {err ? <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div> : null}

      <section className="rounded-xl border bg-white p-4 shadow-sm space-y-3">
        <div className="text-lg font-semibold">Planilha destino</div>
        <label className="space-y-1 block max-w-2xl">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="text-xs text-slate-500">Escolha a versão que receberá as linhas</div>
            <div className="inline-flex items-center rounded-lg border bg-white p-1">
              <button
                type="button"
                className={`rounded-md px-3 py-1.5 text-xs ${importMode === "CSV" ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-50"}`}
                onClick={() => setImportMode("CSV")}
                disabled={loading}
                title="Importar linhas (Itens/Subitens/Serviços) a partir de um arquivo CSV"
              >
                Importar CSV
              </button>
              <button
                type="button"
                className={`rounded-md px-3 py-1.5 text-xs ${importMode === "PLANILHA" ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-50"}`}
                onClick={() => setImportMode("PLANILHA")}
                disabled={loading}
                title="Importar linhas (Itens/Subitens/Serviços) copiando de outra planilha (versão)"
              >
                Importar de outra planilha
              </button>
            </div>
          </div>
          <select className="input bg-white w-full" value={targetPlanilhaId} onChange={(e) => setTargetPlanilhaId(e.target.value)} disabled={loading || targetLocked}>
            <option value="">Selecione...</option>
            {versoes.map((v) => (
              <option key={v.idPlanilha} value={String(v.idPlanilha)}>
                {`v${v.numeroVersao} • ${v.nome}`}
              </option>
            ))}
          </select>
          {targetLocked ? <div className="text-xs text-slate-500">Planilha destino fixada na planilha selecionada.</div> : null}
        </label>
      </section>

      {importMode === "CSV" ? (
      <section className="rounded-xl border bg-white p-4 shadow-sm space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <div className="text-lg font-semibold">Importar CSV</div>
            <div className="text-sm text-slate-600">Converte o CSV em linhas (Itens, subitens e serviços) na planilha destino.</div>
          </div>
          <div className="flex items-center gap-2">
            <button
              className="rounded-lg border bg-white px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-60 inline-flex items-center gap-2"
              type="button"
              onClick={baixarModeloCsv}
              disabled={loading}
            >
              <Download className="h-4 w-4" />
              Modelo CSV
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => {
                const f = (e.target.files || [])[0] || null;
                if (f) void prepararCsvPreview(f);
              }}
            />
            <button
              className="rounded-lg border bg-white px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-60"
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={loading}
              title="Selecionar arquivo CSV para prévia"
            >
              Selecionar CSV
            </button>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <label className="space-y-1">
            <div
              className="text-xs text-slate-500"
              title='Define como as LINHAS serão aplicadas na planilha destino. "Complementar" adiciona ao final; "Substituir" apaga tudo e recria a planilha com o CSV.'
            >
              Modo
            </div>
            <select className="input bg-white w-full" value={csvMode} onChange={(e) => setCsvMode(e.target.value as any)} disabled={loading}>
              <option value="APPEND">Complementar</option>
              <option value="REPLACE">Substituir (apaga e importa)</option>
            </select>
          </label>
          <label className="space-y-1">
            <div
              className="text-xs text-slate-500"
              title="Define o que acontece com o CADASTRO da Fonte de dados (serviços/códigos). Isso pode impactar outras planilhas que usam a mesma Fonte."
            >
              Repetidos na Fonte
            </div>
            <select
              className="input bg-white w-full"
              value={csvCatalogDupPolicy}
              onChange={(e) => setCsvCatalogDupPolicy(e.target.value as any)}
              disabled={loading}
              title={catalogPolicyTooltip(csvCatalogDupPolicy)}
            >
              <option value="FILL">Completar campos vazios (padrão)</option>
              <option value="KEEP">Manter como está</option>
              <option value="OVERWRITE">Sobrescrever (somente dados informados)</option>
            </select>
          </label>
          <label className="flex items-center gap-2 mt-6 text-sm text-slate-700 select-none">
            <input
              type="checkbox"
              checked={csvSkipExistingLines}
              onChange={(e) => setCsvSkipExistingLines(Boolean(e.target.checked))}
              disabled={loading || csvMode === "REPLACE"}
              title={
                csvMode === "REPLACE"
                  ? 'Indisponível no modo "Substituir": a planilha destino será apagada antes de importar.'
                  : 'Quando marcado, o sistema não insere linhas iguais que já existam na planilha destino (mesmo Item/Código/Qtd/Valor).'
              }
            />
            Ignorar linhas repetidas na planilha
          </label>
        </div>
        {csvMode === "REPLACE" || csvCatalogDupPolicy === "OVERWRITE" ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            <div className="font-semibold">Atenção</div>
            {csvMode === "REPLACE" ? <div>- Substituir apaga todas as linhas da planilha destino antes de importar.</div> : null}
            {csvCatalogDupPolicy === "OVERWRITE" ? (
              <div>- Sobrescrever altera a Fonte de dados (cadastro compartilhado) e pode impactar outras planilhas que usam a mesma Fonte.</div>
            ) : null}
          </div>
        ) : null}

        {csvPreview.file ? (
          <div className="rounded-lg border p-3 space-y-2">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="text-sm text-slate-700">
                Arquivo: <span className="font-semibold">{csvPreview.file.name}</span> • Linhas:{" "}
                <span className="font-semibold">{csvPreview.rows.length}</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  className="rounded-lg border bg-white px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-60"
                  type="button"
                  onClick={() => setCsvPreview((prev) => ({ ...prev, rows: prev.rows.map((r) => ({ ...r, checked: true })) }))}
                  disabled={loading || !csvPreview.rows.length}
                >
                  Todos
                </button>
                <button
                  className="rounded-lg border bg-white px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-60"
                  type="button"
                  onClick={() => setCsvPreview((prev) => ({ ...prev, rows: prev.rows.map((r) => ({ ...r, checked: false })) }))}
                  disabled={loading || !csvPreview.rows.length}
                >
                  Nenhum
                </button>
                <button
                  className="rounded-lg border bg-white px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-60"
                  type="button"
                  onClick={() => setCsvPreview({ file: null, rows: [], missingColumns: [] })}
                  disabled={loading}
                >
                  Cancelar
                </button>
                <button
                  className="rounded-lg bg-blue-600 px-3 py-2 text-sm text-white hover:bg-blue-500 disabled:opacity-60"
                  type="button"
                  onClick={confirmarImportacaoCsv}
                  disabled={loading || csvHasBlockingErrors || !targetPlanilhaId}
                  title={csvHasBlockingErrors ? "Corrija o CSV antes de importar" : "Importar prévia na planilha destino"}
                >
                  Importar
                </button>
              </div>
            </div>
            {csvPreview.missingColumns.length ? (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                Colunas obrigatórias ausentes: {csvPreview.missingColumns.join(", ")}
              </div>
            ) : null}
            <div className="rounded-lg border bg-slate-50 p-3 text-sm text-slate-700">
              <div className="font-semibold">Como o sistema trata repetidos</div>
              <div>
                - Fonte de dados (SERVICOS_FONTE): a regra depende de <span className="font-semibold">Repetidos na Fonte</span> (manter / completar / sobrescrever).
              </div>
              <div>
                - Linhas na planilha (SERVICOS_LINHAS): por padrão pode repetir; marque <span className="font-semibold">Ignorar linhas repetidas</span> para não inserir duplicatas iguais.
              </div>
              <div>- Composições/insumos não são importados por esta tela; são tratados nas telas Serviços/SINAPI/Insumos.</div>
            </div>
            <div className="overflow-auto rounded-lg border">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-left text-slate-700">
                  <tr>
                    <th className="px-3 py-2">Sel</th>
                    <th className="px-3 py-2">Linha</th>
                    <th className="px-3 py-2">Item</th>
                    <th className="px-3 py-2">Código</th>
                    <th className="px-3 py-2">Serviços</th>
                    <th className="px-3 py-2">Und</th>
                    <th className="px-3 py-2 text-right">Quant</th>
                    <th className="px-3 py-2 text-right">Valor unitário</th>
                    <th className="px-3 py-2">Tipo</th>
                  </tr>
                </thead>
                <tbody>
                  {csvPreview.rows.slice(0, 2000).map((r) => {
                    const hasErr = Object.keys(r.errors || {}).length > 0;
                    return (
                      <tr key={r.rowIndex} className={`border-t ${hasErr ? "bg-red-50" : ""}`}>
                        <td className="px-3 py-2">
                          <input
                            type="checkbox"
                            checked={r.checked}
                            onChange={(e) => {
                              const checked = Boolean(e.target.checked);
                              setCsvPreview((prev) => ({ ...prev, rows: prev.rows.map((x) => (x.rowIndex === r.rowIndex ? { ...x, checked } : x)) }));
                            }}
                            disabled={loading}
                          />
                        </td>
                        <td className="px-3 py-2 text-xs text-slate-500">{r.rowIndex + 2}</td>
                        <td className="px-3 py-2">{r.item || "—"}</td>
                        <td className="px-3 py-2">{r.codigo || "—"}</td>
                        <td className="px-3 py-2">{r.servicos || "—"}</td>
                        <td className="px-3 py-2">{r.und || "—"}</td>
                        <td className="px-3 py-2 text-right">{r.quant || "—"}</td>
                        <td className="px-3 py-2 text-right">{r.valorUnitario || "—"}</td>
                        <td className="px-3 py-2">{r.tipoLinha}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </section>
      ) : null}

      {importMode === "PLANILHA" ? (
      <section className="rounded-xl border bg-white p-4 shadow-sm space-y-3">
        <div className="text-lg font-semibold">Importar serviços de outra planilha</div>
        <div className="text-sm text-slate-600">Importa linhas (Itens, subitens e serviços) de uma planilha existente para a planilha destino.</div>

        <div className="grid gap-3 md:grid-cols-2">
          <label className="space-y-1">
            <div
              className="text-xs text-slate-500"
              title="Seleciona a planilha que será lida para montar a prévia. Você pode escolher outra obra marcando 'De outra obra'."
            >
              Planilha origem
            </div>
            <select className="input bg-white w-full" value={sourcePlanilhaId} onChange={(e) => setSourcePlanilhaId(e.target.value)} disabled={loading}>
              <option value="">Selecione...</option>
              {[...versoes, ...(includeOutrasObras ? planilhasOutrasObras.filter((v) => Number(v.idObra || 0) !== Number(idObra)) : [])]
                .filter((v) => String(v.idPlanilha) !== String(targetPlanilhaId))
                .map((v) => {
                  const obraPrefix = v.idObra != null && Number(v.idObra) !== Number(idObra) ? `${v.obraNome ? `${v.obraNome} • ` : ""}` : "";
                  return (
                    <option key={`${v.idPlanilha}-${v.numeroVersao}`} value={String(v.idPlanilha)}>
                      {`${obraPrefix}v${v.numeroVersao} • ${v.nome}`}
                    </option>
                  );
                })}
            </select>
            <label
              className="flex items-center gap-2 text-sm text-slate-700 select-none pt-2"
              title="Quando marcado, você pode escolher uma planilha de outra obra como origem. A importação sempre vai para a planilha destino atual."
            >
              <input type="checkbox" checked={includeOutrasObras} onChange={(e) => setIncludeOutrasObras(Boolean(e.target.checked))} disabled={loading} />
              De outra obra
            </label>
          </label>
          <label className="space-y-1">
            <div
              className="text-xs text-slate-500"
              title='Define como as LINHAS serão aplicadas na planilha destino. "Complementar" adiciona ao final; "Substituir" apaga tudo e recria com a seleção da prévia.'
            >
              Modo
            </div>
          <div className="flex items-start gap-3 flex-wrap">
            <select className="input bg-white min-w-[220px] flex-1" value={planilhaImportMode} onChange={(e) => setPlanilhaImportMode(e.target.value as any)} disabled={loading}>
              <option value="APPEND">Complementar</option>
              <option value="REPLACE">Substituir (apaga e importa)</option>
            </select>
            <label className="flex items-center gap-2 text-sm text-slate-700 select-none pt-2">
              <input
                type="checkbox"
                checked={planilhaSkipExistingLines}
                onChange={(e) => setPlanilhaSkipExistingLines(Boolean(e.target.checked))}
                disabled={loading || planilhaImportMode === "REPLACE"}
                title={
                  planilhaImportMode === "REPLACE"
                    ? 'Indisponível no modo "Substituir": a planilha destino será apagada antes de importar.'
                    : 'Quando marcado, o sistema não insere linhas iguais que já existam na planilha destino (mesmo Item/Código/Qtd/Valor).'
                }
              />
              Ignorar linhas repetidas
            </label>
          </div>
          </label>
        </div>

        {planilhaImportMode === "REPLACE" ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            <div className="font-semibold">Atenção</div>
            {planilhaImportMode === "REPLACE" ? <div>- Substituir apaga todas as linhas da planilha destino antes de importar.</div> : null}
          </div>
        ) : null}

        <div className="flex items-center justify-between gap-2 flex-wrap">
          <button
            className="rounded-lg border bg-white px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-60"
            type="button"
            onClick={carregarServicosDaPlanilha}
            disabled={loading || !sourcePlanilhaId}
            title="Carrega as linhas da planilha origem para você revisar e selecionar antes de importar"
          >
            Carregar prévia
          </button>
        </div>

        {sourceRows.length ? (
          <div className="rounded-lg border p-3 space-y-2">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="text-sm text-slate-700">
                Linhas: <span className="font-semibold">{sourceRows.length}</span>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  className="rounded-lg border bg-white px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-60"
                  type="button"
                  onClick={() => setSourceRows((prev) => prev.map((x) => ({ ...x, checked: true })))}
                  disabled={loading || !sourceRows.length}
                  title="Selecionar todas as linhas da prévia"
                >
                  Todos
                </button>
                <button
                  className="rounded-lg border bg-white px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-60"
                  type="button"
                  onClick={() => setSourceRows((prev) => prev.map((x) => ({ ...x, checked: false })))}
                  disabled={loading || !sourceRows.length}
                  title="Desmarcar todas as linhas da prévia"
                >
                  Nenhum
                </button>
                <button
                  className="rounded-lg border bg-white px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-60"
                  type="button"
                  onClick={() => setSourceRows([])}
                  disabled={loading}
                  title="Fecha a prévia (não altera a planilha destino)"
                >
                  Cancelar
                </button>
                <button
                  className="rounded-lg bg-blue-600 px-3 py-2 text-sm text-white hover:bg-blue-500 disabled:opacity-60"
                  type="button"
                  onClick={confirmarImportacaoPlanilha}
                  disabled={loading || !targetPlanilhaId || !sourcePlanilhaId || !sourceRows.some((x) => x.checked)}
                  title="Importa as linhas selecionadas para a planilha destino"
                >
                  Importar
                </button>
              </div>
            </div>
            <div className="overflow-auto rounded-lg border">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-left text-slate-700">
                  <tr>
                    <th className="px-3 py-2">Sel</th>
                    <th className="px-3 py-2">Item</th>
                    <th className="px-3 py-2">Código</th>
                    <th className="px-3 py-2">Serviços</th>
                    <th className="px-3 py-2">Und</th>
                    <th className="px-3 py-2 text-right">Quant</th>
                    <th className="px-3 py-2 text-right">Valor unitário</th>
                    <th className="px-3 py-2">Tipo</th>
                  </tr>
                </thead>
                <tbody>
                  {sourceRows.map((x, idx) => (
                    <tr key={`${x.r.tipoLinha}-${x.r.item}-${x.r.codigo}-${idx}`} className="border-t">
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          checked={x.checked}
                          onChange={(e) => {
                            const checked = Boolean(e.target.checked);
                            setSourceRows((prev) => prev.map((p, i) => (i === idx ? { ...p, checked } : p)));
                          }}
                          disabled={loading}
                        />
                      </td>
                      <td className="px-3 py-2">{x.r.item || "—"}</td>
                      <td className="px-3 py-2">{x.r.codigo || "—"}</td>
                      <td className="px-3 py-2">{x.r.servicos || "—"}</td>
                      <td className="px-3 py-2">{x.r.und || "—"}</td>
                      <td className="px-3 py-2 text-right">{x.r.quant || "—"}</td>
                      <td className="px-3 py-2 text-right">{x.r.valorUnitario || "—"}</td>
                      <td className="px-3 py-2">{x.r.tipoLinha}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </section>
      ) : null}
    </div>
  );
}
