"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Download, Check } from "lucide-react";

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
  const sep = semi > comma ? ";" : ",";
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
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buf);
  } catch {
    return new TextDecoder("windows-1252").decode(buf);
  }
}

function toDec(v: unknown) {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const norm = s.replace(/\./g, "").replace(",", ".").replace(/[^\d.\-]/g, "");
  if (!norm) return null;
  const n = Number(norm);
  return Number.isFinite(n) ? n : null;
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
  const [obraStatus, setObraStatus] = useState<string | null>(null);
  const [obraResumo, setObraResumo] = useState<ObraResumo | null>(null);
  const [versoes, setVersoes] = useState<VersaoRow[]>([]);
  const [planilha, setPlanilha] = useState<Planilha | null>(null);
  const [planilhaId, setPlanilhaId] = useState<number | null>(null);

  const [selecionado, setSelecionado] = useState<string>("");
  const [composicao, setComposicao] = useState<{ codigoComposicao: string | null; itens: ComposicaoItem[] }>({ codigoComposicao: null, itens: [] });
  const [centrosCusto, setCentrosCusto] = useState<CentroCustoOption[]>([]);

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

  const [uiPrefs, setUiPrefs] = useState<{ fontSizePx: number; itemBg: string; subitemBg: string }>({
    fontSizePx: 14,
    itemBg: "#F8FAFC",
    subitemBg: "#FFFFFF",
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

  const [parametros, setParametros] = useState({
    dataBaseSbc: "",
    dataBaseSinapi: "",
    bdiServicosSbc: "",
    bdiServicosSinapi: "",
    bdiDiferenciadoSbc: "",
    bdiDiferenciadoSinapi: "",
    encSociaisSemDesSbc: "",
    encSociaisSemDesSinapi: "",
    descontoSbc: "",
    descontoSinapi: "",
  });

  const podeEditar = useMemo(() => {
    if (!planilha) return true;
    return Boolean(planilha.atual);
  }, [planilha, obraStatus]);

  useEffect(() => {
    try {
      const key = getUserPrefKey();
      const raw = localStorage.getItem(key);
      if (!raw) return;
      const parsed = JSON.parse(raw) as any;
      const fontSizePx = parsed?.fontSizePx != null ? Number(parsed.fontSizePx) : NaN;
      const itemBg = typeof parsed?.itemBg === "string" ? String(parsed.itemBg) : "";
      const subitemBg = typeof parsed?.subitemBg === "string" ? String(parsed.subitemBg) : "";
      setUiPrefs((p) => ({
        fontSizePx: Number.isFinite(fontSizePx) && fontSizePx >= 10 && fontSizePx <= 22 ? fontSizePx : p.fontSizePx,
        itemBg: itemBg && itemBg.startsWith("#") ? itemBg : p.itemBg,
        subitemBg: subitemBg && subitemBg.startsWith("#") ? subitemBg : p.subitemBg,
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
      const atual = normalized.find((v) => v.atual) || normalized[0] || null;
      setPlanilhaId((cur) => cur || (atual?.idPlanilha ?? null));
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

  async function carregarComposicaoItens(codigoServico: string) {
    if (!codigoServico) {
      setComposicao({ codigoComposicao: null, itens: [] });
      return;
    }
    try {
      setErr(null);
      const res = await authFetch(`/api/v1/engenharia/obras/${idObra}/planilha/servicos/${encodeURIComponent(codigoServico)}/composicao-itens`);
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.message || "Erro ao carregar composição do serviço");
      setComposicao({ codigoComposicao: json.data?.codigoComposicao || null, itens: Array.isArray(json.data?.itens) ? json.data.itens : [] });
    } catch (e: any) {
      setErr(e?.message || "Erro ao carregar composição do serviço");
      setComposicao({ codigoComposicao: null, itens: [] });
    }
  }

  async function salvarComposicaoItens() {
    if (!selecionado) return;
    try {
      setLoading(true);
      setErr(null);
      const updates = composicao.itens.map((i) => ({ idItemBase: i.idItemBase, codigoCentroCusto: i.codigoCentroCusto }));
      const res = await authFetch(`/api/v1/engenharia/obras/${idObra}/planilha/servicos/${encodeURIComponent(selecionado)}/composicao-itens`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ updates }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.message || "Erro ao salvar composição do serviço");
      await carregarComposicaoItens(selecionado);
    } catch (e: any) {
      setErr(e?.message || "Erro ao salvar composição do serviço");
    } finally {
      setLoading(false);
    }
  }

  const servicosOptions = useMemo(() => {
    const list = (planilha?.linhas || []).filter((l) => l.tipoLinha === "SERVICO" && l.codigo.trim()).map((l) => l.codigo.trim().toUpperCase());
    return Array.from(new Set(list)).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [planilha]);

  useEffect(() => {
    if (!idObra) return;
    carregarVersoes();
    carregarCentrosCusto();
  }, [idObra]);

  useEffect(() => {
    if (planilhaId) carregarPlanilha(planilhaId);
  }, [planilhaId]);

  useEffect(() => {
    if (!selecionado) return;
    carregarComposicaoItens(selecionado);
  }, [selecionado]);

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
    } catch (e: any) {
      setErr(e?.message || "Erro ao salvar parâmetros");
    } finally {
      setLoading(false);
    }
  }

  async function salvarLinha() {
    if (!planilha) return;
    try {
      setLoading(true);
      setErr(null);
      const ordem = Number(novo.ordem || 0) || ((planilha.linhas || []).reduce((m, l) => Math.max(m, Number(l.ordem || 0)), 0) + 1);
      const res = await authFetch(`/api/v1/engenharia/obras/${idObra}/planilha`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "UPSERT_LINHA",
          idPlanilha: planilha.idPlanilha,
          linha: {
            ordem,
            item: novo.item,
            codigo: novo.codigo,
            fonte: novo.fonte,
            servicos: novo.servicos,
            und: novo.und,
            quant: novo.quant,
            valorUnitario: novo.valorUnitario,
            valorParcial: novo.valorParcial,
            tipoLinha: novo.tipoLinha,
          },
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.message || "Erro ao salvar linha");
      setNovo({ tipoLinha: "SERVICO", ordem: "", item: "", codigo: "", fonte: "", servicos: "", und: "", quant: "", valorUnitario: "", valorParcial: "" });
      await carregarPlanilha(planilha.idPlanilha);
      await carregarVersoes();
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
      await carregarPlanilha(planilha.idPlanilha);
      await carregarVersoes();
    } catch (e: any) {
      setErr(e?.message || "Erro ao excluir linha");
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

  return (
    <div className="p-6 space-y-6 max-w-7xl text-slate-900">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex-1 min-w-[260px]">
          <div className="text-xs text-slate-500">{breadcrumb}</div>
          <h1 className="text-2xl font-semibold">Planilha orçamentária — Obra #{idObra}</h1>
          <div className="text-sm text-slate-600">Versões do orçamento por obra (itens, subitens e serviços). A programação e apropriação usam os serviços da versão atual.</div>
          {obraResumo ? (
            <div className="mt-2 text-sm text-slate-700">
              <span className="font-semibold">{obraResumo.nome ? obraResumo.nome : `Obra #${idObra}`}</span>
              {" • "}
              <span>Status: {obraResumo.status ? obraResumo.status : "—"}</span>
              {" • "}
              <span>Contrato: {obraResumo.contratoNumero ? obraResumo.contratoNumero : obraResumo.contratoId ? `#${obraResumo.contratoId}` : "—"}</span>
              {" • "}
              <span>Valor previsto: {obraResumo.valorPrevisto == null ? "—" : moeda(Number(obraResumo.valorPrevisto || 0))}</span>
            </div>
          ) : null}
        </div>
        <div className="flex gap-2 flex-wrap items-center justify-end w-full lg:w-auto ml-auto">
          <button className="rounded-lg border bg-white px-4 py-2 text-sm hover:bg-slate-50" type="button" onClick={() => router.push(returnTo || `/dashboard/engenharia/obras/${idObra}`)}>
            Voltar
          </button>
          <button className="rounded-lg border bg-white px-4 py-2 text-sm hover:bg-slate-50" type="button" onClick={carregarVersoes} disabled={loading}>
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
            className="rounded-lg border bg-white px-4 py-2 text-sm hover:bg-slate-50 disabled:opacity-60"
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={loading || !podeEditar}
            title={!podeEditar ? "Importar somente na versão atual" : "Importar CSV"}
          >
            Importar CSV
          </button>
          <button className="rounded-lg border bg-white px-4 py-2 text-sm hover:bg-slate-50 inline-flex items-center gap-2" type="button" onClick={baixarModeloCsv} disabled={loading}>
            <Download className="h-4 w-4" />
            Modelo CSV
          </button>
          <button
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-500 disabled:opacity-60"
            type="button"
            onClick={criarNovaVersao}
            disabled={loading || !podeEditar}
            title={!podeEditar ? "Criar nova versão somente na versão atual" : "Nova planilha"}
          >
            Nova planilha
          </button>
        </div>
      </div>

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
        <div className="text-lg font-semibold">Versões cadastradas</div>
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
              <div className="text-sm text-slate-600">Status da obra: {obraStatus || "—"}</div>
            </div>
          </section>

          <section className="rounded-xl border bg-white p-4 shadow-sm space-y-3">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="text-lg font-semibold">Parâmetros (Obra pública)</div>
              <button className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white disabled:opacity-60" type="button" onClick={salvarParametros} disabled={loading || !podeEditar}>
                Salvar parâmetros
              </button>
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
                          className="input bg-white"
                          value={(parametros as any)[a]}
                          onChange={(e) => setParametros((p) => ({ ...p, [a]: e.target.value } as any))}
                          disabled={!podeEditar}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          className="input bg-white"
                          value={(parametros as any)[b]}
                          onChange={(e) => setParametros((p) => ({ ...p, [b]: e.target.value } as any))}
                          disabled={!podeEditar}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-xl border bg-white p-4 shadow-sm space-y-3">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="text-lg font-semibold">Planilha orçamentária (itens)</div>
              <div className="flex items-center gap-3 flex-wrap text-sm text-slate-600">
                <div>{planilha.linhas.length} linha(s)</div>
                <div>Valor total: <span className="font-semibold text-slate-900">{moeda(Number(valorTotalPlanilha || 0))}</span></div>
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 flex-wrap rounded-lg border bg-white p-3">
              <div className="text-sm font-semibold">Visual</div>
              <div className="flex items-center gap-3 flex-wrap">
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

            <div className="rounded-lg border bg-slate-50 p-3 space-y-3">
              <div className="text-sm font-semibold">Adicionar linha</div>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-10">
                <div className="md:col-span-2">
                  <div className="text-sm text-slate-600">Tipo</div>
                  <select className="input bg-white" value={novo.tipoLinha} onChange={(e) => setNovo((p) => ({ ...p, tipoLinha: e.target.value as any }))} disabled={!podeEditar}>
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
                  <input className="input bg-white" value={novo.item} onChange={(e) => setNovo((p) => ({ ...p, item: e.target.value }))} disabled={!podeEditar} placeholder="1.1" />
                </div>
                <div>
                  <div className="text-sm text-slate-600">CÓDIGO</div>
                  <input className="input bg-white" value={novo.codigo} onChange={(e) => setNovo((p) => ({ ...p, codigo: e.target.value }))} disabled={!podeEditar} placeholder="SER-0001" />
                </div>
                <div>
                  <div className="text-sm text-slate-600">FONTE</div>
                  <input className="input bg-white" value={novo.fonte} onChange={(e) => setNovo((p) => ({ ...p, fonte: e.target.value }))} disabled={!podeEditar} placeholder="SINAPI" />
                </div>
                <div className="md:col-span-2">
                  <div className="text-sm text-slate-600">SERVIÇOS</div>
                  <input className="input bg-white" value={novo.servicos} onChange={(e) => setNovo((p) => ({ ...p, servicos: e.target.value }))} disabled={!podeEditar} />
                </div>
                <div>
                  <div className="text-sm text-slate-600">UND</div>
                  <input className="input bg-white" value={novo.und} onChange={(e) => setNovo((p) => ({ ...p, und: e.target.value }))} disabled={!podeEditar} placeholder="m²" />
                </div>
                <div>
                  <div className="text-sm text-slate-600">QUANT.</div>
                  <input className="input bg-white" value={novo.quant} onChange={(e) => setNovo((p) => ({ ...p, quant: e.target.value }))} disabled={!podeEditar} />
                </div>
                <div>
                  <div className="text-sm text-slate-600">VALOR UNIT.</div>
                  <input className="input bg-white" value={novo.valorUnitario} onChange={(e) => setNovo((p) => ({ ...p, valorUnitario: e.target.value }))} disabled={!podeEditar} />
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-6">
                <div className="md:col-span-2">
                  <div className="text-sm text-slate-600">VALOR PARCIAL</div>
                  <input className="input bg-white" value={novo.valorParcial} onChange={(e) => setNovo((p) => ({ ...p, valorParcial: e.target.value }))} disabled={!podeEditar} />
                </div>
                <div className="md:col-span-4 flex items-end justify-end">
                  <button className="rounded-lg bg-green-600 px-4 py-2 text-sm text-white disabled:opacity-60" type="button" onClick={salvarLinha} disabled={loading || !podeEditar}>
                    Salvar linha
                  </button>
                </div>
              </div>
            </div>

            <div className="overflow-auto">
              <table className="min-w-[1100px] w-full" style={{ fontSize: `${uiPrefs.fontSizePx}px` }}>
                <thead className="bg-slate-50 text-left text-slate-700">
                  <tr>
                    <th className="px-3 py-2">ITEM</th>
                    <th className="px-3 py-2">CÓDIGO</th>
                    <th className="px-3 py-2">FONTE</th>
                    <th className="px-3 py-2">SERVIÇOS</th>
                    <th className="px-3 py-2">UND</th>
                    <th className="px-3 py-2 text-right">QUANT.</th>
                    <th className="px-3 py-2 text-right">VALOR UNIT.</th>
                    <th className="px-3 py-2 text-right">VALOR PARCIAL</th>
                    <th className="px-3 py-2">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {planilha.linhas.map((l) => (
                    <tr
                      key={l.idLinha}
                      className={`border-t ${l.tipoLinha === "ITEM" || l.tipoLinha === "SUBITEM" ? "font-bold" : ""}`}
                      style={{
                        backgroundColor: l.tipoLinha === "ITEM" ? uiPrefs.itemBg : l.tipoLinha === "SUBITEM" ? uiPrefs.subitemBg : undefined,
                      }}
                    >
                      <td className="px-3 py-2">{l.item || ""}</td>
                      <td className="px-3 py-2">{l.codigo || ""}</td>
                      <td className="px-3 py-2">{l.fonte || ""}</td>
                      <td className="px-3 py-2">{l.servicos || ""}</td>
                      <td className="px-3 py-2">{l.und || ""}</td>
                      <td className="px-3 py-2 text-right">{l.quant || ""}</td>
                      <td className="px-3 py-2 text-right">{l.valorUnitario || ""}</td>
                      <td className="px-3 py-2 text-right">
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
                        <button className="rounded border px-2 py-1 text-xs text-red-700 disabled:opacity-60" type="button" onClick={() => excluirLinha(l.idLinha)} disabled={!podeEditar || loading}>
                          Excluir
                        </button>
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
          </section>

          <section className="rounded-xl border bg-white p-4 shadow-sm space-y-4">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <div className="text-lg font-semibold">Centro de custos por insumo (composição do serviço)</div>
                <div className="text-sm text-slate-600">Selecione um serviço para ajustar centro de custo em cada item da composição.</div>
              </div>
              <button className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white disabled:opacity-60" type="button" onClick={salvarComposicaoItens} disabled={!selecionado || loading}>
                Salvar composição
              </button>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <div>
                <div className="text-sm text-slate-600">Serviço</div>
                <select className="input bg-white" value={selecionado} onChange={(e) => setSelecionado(e.target.value)}>
                  <option value="">Selecione</option>
                  {servicosOptions.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {!selecionado ? <div className="text-sm text-slate-500">Selecione um serviço.</div> : null}

            {selecionado ? (
              <div className="space-y-3">
                {composicao.codigoComposicao ? (
                  <div className="text-sm text-slate-600">
                    Composição: <span className="font-medium">{composicao.codigoComposicao}</span>
                  </div>
                ) : (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">⚠️ Serviço sem composição vinculada na base corporativa.</div>
                )}

                {composicao.itens.some((i) => !i.codigoCentroCusto) ? (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">⚠️ Existem insumos sem centro de custo definido.</div>
                ) : null}

                <div className="overflow-auto">
                  <table className="min-w-full text-sm">
                    <thead className="bg-slate-50 text-left">
                      <tr>
                        <th className="px-3 py-2">Etapa</th>
                        <th className="px-3 py-2">Tipo</th>
                        <th className="px-3 py-2">Insumo</th>
                        <th className="px-3 py-2">Qtd</th>
                        <th className="px-3 py-2">Perda%</th>
                        <th className="px-3 py-2">Centro de custo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {composicao.itens.map((i) => (
                        <tr key={i.idItemBase} className="border-t">
                          <td className="px-3 py-2">{i.etapa || "-"}</td>
                          <td className="px-3 py-2">{i.tipoItem}</td>
                          <td className="px-3 py-2">{i.codigoItem}</td>
                          <td className="px-3 py-2">{i.quantidade == null ? "-" : Number(i.quantidade).toFixed(4)}</td>
                          <td className="px-3 py-2">{Number(i.perdaPercentual || 0).toFixed(2)}</td>
                          <td className="px-3 py-2">
                            <select
                              className="input bg-white"
                              value={i.codigoCentroCusto || ""}
                              onChange={(e) => {
                                const v = e.target.value || null;
                                setComposicao((p) => ({
                                  ...p,
                                  itens: p.itens.map((x) => (x.idItemBase === i.idItemBase ? { ...x, codigoCentroCusto: v } : x)),
                                }));
                              }}
                            >
                              <option value="">(sem CC)</option>
                              {centrosCusto.map((c) => (
                                <option key={c.codigo} value={c.codigo}>
                                  {c.codigo} — {c.descricao}
                                </option>
                              ))}
                            </select>
                            {i.codigoCentroCustoBase && i.codigoCentroCusto !== i.codigoCentroCustoBase ? (
                              <div className="mt-1 text-xs text-slate-500">Base: {i.codigoCentroCustoBase}</div>
                            ) : null}
                          </td>
                        </tr>
                      ))}
                      {!composicao.itens.length ? (
                        <tr>
                          <td colSpan={6} className="px-3 py-6 text-center text-slate-500">
                            Sem itens de composição.
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}
          </section>
        </>
      ) : null}
    </div>
  );
}
