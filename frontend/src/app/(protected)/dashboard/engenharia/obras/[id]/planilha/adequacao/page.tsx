"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Eye, EyeOff, FileSpreadsheet, Filter, Image, Printer } from "lucide-react";
import { PageLoadStatusBadge } from "@/components/PageLoadStatus";

type VersaoRow = {
  idPlanilha: number;
  numeroVersao: number;
  nome: string;
  atual: boolean;
  idFonteDados?: number | null;
  idParametros?: number | null;
  fonteNome?: string;
  parametrosNome?: string;
  valorTotal?: number | null;
  totalServicos?: number | null;
};

type AdequacaoRow = {
  tipoLinha: "ITEM" | "SUBITEM" | "SERVICO";
  item: string;
  servicos: string;
  und: string;
  contratadoQuant: number;
  contratadoPreco: number;
  contratadoTotal: number;
  qAditado: number;
  qSuprimido: number;
  qAdequado: number;
  vAditado: number;
  vSuprimido: number;
  vAdequado: number;
};

type EmpresaDocumentosLayout = {
  logoDataUrl: string | null;
  cabecalhoHtml: string | null;
  rodapeHtml: string | null;
  cabecalhoAlturaMm: number | null;
  rodapeAlturaMm: number | null;
  atualizadoEm: string | null;
};

function fmtNumber(v: number, decimals: number) {
  const n = Number(v || 0);
  return n.toLocaleString("pt-BR", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function fmtMoney(v: number) {
  const n = Number(v || 0);
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function isRoundedZero(v: number, decimals: number) {
  const n = Number(v || 0);
  if (!Number.isFinite(n)) return true;
  const m = 10 ** Math.max(0, Math.min(6, Math.round(decimals)));
  return Math.round(n * m) === 0;
}

function fmtNumberBlankZero(v: number, decimals: number) {
  return isRoundedZero(v, decimals) ? "" : fmtNumber(v, decimals);
}

function fmtMoneyBlankZero(v: number) {
  return isRoundedZero(v, 2) ? "" : fmtMoney(v);
}

function escapeHtml(s: unknown) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default function AdequacaoPlanilhaPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const search = useSearchParams();

  const idObra = Number(params?.id || 0);
  const planilhaIdFromQs = search.get("planilhaId");
  const returnTo = search.get("returnTo");

  const [empresaDocumentosLayout, setEmpresaDocumentosLayout] = useState<EmpresaDocumentosLayout | null>(null);

  const safeReturnTo = useMemo(() => {
    const raw = String(returnTo || "").trim();
    const isExternal = raw.startsWith("//") || /^(?:[a-z][a-z0-9+.-]*:)?\/\//i.test(raw) || /^[a-z][a-z0-9+.-]*:/i.test(raw);
    return raw && !isExternal ? raw : null;
  }, [returnTo]);

  const [loading, setLoading] = useState(false);
  const [bootLoading, setBootLoading] = useState(false);
  const [bootDone, setBootDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [obraNome, setObraNome] = useState<string>("");
  const [contratoNumero, setContratoNumero] = useState<string>("");
  const [contratoId, setContratoId] = useState<number | null>(null);
  const [contratoObjeto, setContratoObjeto] = useState<string>("");
  const [contratanteNome, setContratanteNome] = useState<string>("");
  const [contratoValorConcedente, setContratoValorConcedente] = useState<number | null>(null);
  const [contratoValorRecursosProprio, setContratoValorRecursosProprio] = useState<number | null>(null);
  const [versoes, setVersoes] = useState<VersaoRow[]>([]);
  const [sourcePlanilhaId, setSourcePlanilhaId] = useState<string>("");
  const [targetPlanilhaId, setTargetPlanilhaId] = useState<string>(planilhaIdFromQs ? String(planilhaIdFromQs) : "");

  const [showPrintConfig, setShowPrintConfig] = useState(false);
  const [showPrintAdvanced, setShowPrintAdvanced] = useState(false);
  const [showVisual, setShowVisual] = useState(false);
  const [somenteItens, setSomenteItens] = useState(false);
  const [gridFilter, setGridFilter] = useState({
    item: "",
    servicos: "",
    und: "",
    contratadoQuant: "",
    contratadoPreco: "",
    contratadoTotal: "",
  });
  const [showFilters, setShowFilters] = useState(false);

  const hasActiveGridFilter = useMemo(() => {
    return Object.values(gridFilter).some((v) => String(v ?? "").trim());
  }, [gridFilter]);
  const [uiPrefs, setUiPrefs] = useState<{
    fontSizePx: number;
    itemBg: string;
    subitemBg: string;
    colorDiff: boolean;
    wItemPx: number;
    wServicosPx: number;
    wUndPx: number;
    wNumPx: number;
    print: {
      headerFontFamily: string;
      headerFontSizePx: number;
      headerFontWeight: "normal" | "semibold" | "bold";
      margemSuperiorAdicionalPx: number;
      espacoAposCabecalhoPx: number;
      espacoAposQuadroPx: number;
      includeEmpresaHeader: boolean;
      repeatDadosEmTodasFolhas: boolean;
    };
  }>({
    fontSizePx: 14,
    itemBg: "#F8FAFC",
    subitemBg: "#FFFFFF",
    colorDiff: false,
    wItemPx: 80,
    wServicosPx: 620,
    wUndPx: 52,
    wNumPx: 92,
    print: {
      headerFontFamily: "Arial",
      headerFontSizePx: 11,
      headerFontWeight: "semibold",
      margemSuperiorAdicionalPx: 0,
      espacoAposCabecalhoPx: 8,
      espacoAposQuadroPx: 8,
      includeEmpresaHeader: true,
      repeatDadosEmTodasFolhas: true,
    },
  });

  const [rows, setRows] = useState<AdequacaoRow[]>([]);
  const [dstParams, setDstParams] = useState<any>(null);

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
    try {
      const raw = localStorage.getItem(`planilha_adequacao_ui_v2`);
      if (!raw) return;
      const parsed = JSON.parse(raw) as any;
      const n = (v: any, min: number, max: number, fallback: number) => {
        const x = Number(v);
        return Number.isFinite(x) ? Math.max(min, Math.min(max, Math.round(x))) : fallback;
      };
      setUiPrefs((cur) => ({
        fontSizePx: n(parsed?.fontSizePx, 10, 18, cur.fontSizePx),
        itemBg: typeof parsed?.itemBg === "string" && String(parsed.itemBg).startsWith("#") ? String(parsed.itemBg) : cur.itemBg,
        subitemBg: typeof parsed?.subitemBg === "string" && String(parsed.subitemBg).startsWith("#") ? String(parsed.subitemBg) : cur.subitemBg,
        colorDiff: parsed?.colorDiff === true,
        wItemPx: n(parsed?.wItemPx, 56, 200, cur.wItemPx),
        wServicosPx: n(parsed?.wServicosPx, 260, 1200, cur.wServicosPx),
        wUndPx: n(parsed?.wUndPx, 40, 140, cur.wUndPx),
        wNumPx: n(parsed?.wNumPx, 70, 200, cur.wNumPx),
        print: {
          headerFontFamily: typeof parsed?.print?.headerFontFamily === "string" && String(parsed.print.headerFontFamily).trim() ? String(parsed.print.headerFontFamily).trim() : cur.print.headerFontFamily,
          headerFontSizePx: n(parsed?.print?.headerFontSizePx, 8, 16, cur.print.headerFontSizePx),
          headerFontWeight: (["normal", "semibold", "bold"].includes(String(parsed?.print?.headerFontWeight)) ? parsed.print.headerFontWeight : cur.print.headerFontWeight) as any,
          margemSuperiorAdicionalPx: n(
            parsed?.print?.margemSuperiorAdicionalPx ?? parsed?.print?.topToHeaderPx,
            0,
            80,
            cur.print.margemSuperiorAdicionalPx
          ),
          espacoAposCabecalhoPx: n(
            parsed?.print?.espacoAposCabecalhoPx ?? parsed?.print?.headerToDadosPx,
            0,
            80,
            cur.print.espacoAposCabecalhoPx
          ),
          espacoAposQuadroPx: n(
            parsed?.print?.espacoAposQuadroPx ?? parsed?.print?.dadosToTabelaPx,
            0,
            120,
            cur.print.espacoAposQuadroPx
          ),
          includeEmpresaHeader: parsed?.print?.includeEmpresaHeader !== false,
          repeatDadosEmTodasFolhas: parsed?.print?.repeatDadosEmTodasFolhas !== false,
        },
      }));
      setSomenteItens(Boolean(parsed?.somenteItens));
      setShowPrintAdvanced(Boolean(parsed?.print?.showPrintAdvanced));
      setShowVisual(Boolean(parsed?.showVisual));
    } catch {}
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(
        `planilha_adequacao_ui_v2`,
        JSON.stringify({ ...uiPrefs, somenteItens, showVisual, print: { ...uiPrefs.print, showPrintAdvanced } })
      );
    } catch {}
  }, [uiPrefs, somenteItens, showPrintAdvanced, showVisual]);

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

  async function carregarContratoVinculado() {
    try {
      if (!idObra) return;
      const res = await authFetch(`/api/v1/engenharia/obras/${idObra}/contrato`);
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) return;
      const d = json.data || {};
      setContratoNumero(String(d?.numeroContrato || "").trim());
      setContratoId(d?.idContrato != null ? Number(d.idContrato) : null);
      setContratoObjeto(String(d?.objeto || "").trim());
      setContratanteNome(String(d?.contratante || "").trim());
      setContratoValorConcedente(d?.valorConcedente == null || d?.valorConcedente === "" ? null : Number(d.valorConcedente));
      setContratoValorRecursosProprio(d?.valorRecursosProprio == null || d?.valorRecursosProprio === "" ? null : Number(d.valorRecursosProprio));
      if (String(d?.nomeObra || "").trim()) setObraNome(String(d.nomeObra || "").trim());
    } catch {}
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

  async function carregarVersoes() {
    if (!idObra) return;
    try {
      setErr(null);
      const res = await authFetch(`/api/v1/engenharia/obras/${idObra}/planilha?view=versoes`);
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.message || "Erro ao carregar versões");

      const obra = json.data?.obra || null;
      setObraNome(String(obra?.nome || "").trim());
      setContratoNumero(String(obra?.contratoNumero || "").trim());
      setContratoId(obra?.contratoId != null ? Number(obra.contratoId) : null);

      const list = Array.isArray(json.data?.versoes) ? (json.data.versoes as any[]) : [];
      const normalized: VersaoRow[] = list
        .map((v) => ({
          idPlanilha: Number(v.idPlanilha),
          numeroVersao: Number(v.numeroVersao),
          nome: String(v.nome || ""),
          atual: Boolean(v.atual),
          idFonteDados: v?.idFonteDados == null ? null : Number(v.idFonteDados),
          idParametros: v?.idParametros == null ? null : Number(v.idParametros),
          fonteNome: String(v?.fonteNome || ""),
          parametrosNome: String(v?.parametrosNome || ""),
          valorTotal: v?.valorTotal == null ? null : Number(v.valorTotal),
          totalServicos: v?.totalServicos == null ? null : Number(v.totalServicos),
        }))
        .filter((v) => Number.isFinite(v.idPlanilha) && v.idPlanilha > 0);
      setVersoes(normalized);

      const targetId = Number(String(targetPlanilhaId || "").trim() || 0);
      const current = targetId ? normalized.find((x) => Number(x.idPlanilha) === targetId) : normalized.find((x) => x.atual) || normalized[0] || null;
      if (current && !targetPlanilhaId) setTargetPlanilhaId(String(current.idPlanilha));

      const pickTarget = current || null;
      const candidates = normalized
        .filter((x) => pickTarget && Number(x.idPlanilha) !== Number(pickTarget.idPlanilha))
        .sort((a, b) => b.numeroVersao - a.numeroVersao);
      const prevByVersao =
        pickTarget != null ? candidates.find((x) => Number(x.numeroVersao) === Number(pickTarget.numeroVersao) - 1) || candidates[0] || null : candidates[0] || null;
      if (prevByVersao && !sourcePlanilhaId) setSourcePlanilhaId(String(prevByVersao.idPlanilha));
    } catch (e: any) {
      setErr(e?.message || "Erro ao carregar versões");
      setVersoes([]);
    }
  }

  async function carregarDestinoParams(dstId: number) {
    try {
      if (!idObra || !dstId) return;
      const resP = await authFetch(`/api/v1/engenharia/obras/${idObra}/planilha?planilhaId=${dstId}&includeCatalog=0`);
      const jsonP = await resP.json().catch(() => null);
      if (!resP.ok || !jsonP?.success) return;
      setDstParams(jsonP.data?.planilha?.parametros || null);
    } catch {}
  }

  useEffect(() => {
    const dstId = Number(String(targetPlanilhaId || "").trim() || 0);
    if (!dstId) {
      setDstParams(null);
      return;
    }
    void carregarDestinoParams(dstId);
  }, [idObra, targetPlanilhaId]);

  const selectedTarget = useMemo(() => {
    const id = Number(String(targetPlanilhaId || "").trim() || 0);
    if (!id) return null;
    return versoes.find((v) => Number(v.idPlanilha) === id) || null;
  }, [targetPlanilhaId, versoes]);

  const selectedSource = useMemo(() => {
    const id = Number(String(sourcePlanilhaId || "").trim() || 0);
    if (!id) return null;
    return versoes.find((v) => Number(v.idPlanilha) === id) || null;
  }, [sourcePlanilhaId, versoes]);

  const totalsAll = useMemo(() => {
    const serv = rows.filter((r) => r.tipoLinha === "SERVICO");
    const sum = (pick: (r: AdequacaoRow) => number) => {
      let t = 0;
      for (const r of serv) t += Number(pick(r) || 0);
      return Number(t.toFixed(2));
    };
    return {
      contratadoTotal: sum((r) => r.contratadoTotal),
      adequadoTotal: sum((r) => r.vAdequado),
      vAditado: sum((r) => r.vAditado),
      vSuprimido: sum((r) => r.vSuprimido),
    };
  }, [rows]);

  const totalsDiff = useMemo(() => {
    const src = selectedSource?.valorTotal == null ? null : Number(selectedSource.valorTotal || 0);
    const dst = selectedTarget?.valorTotal == null ? null : Number(selectedTarget.valorTotal || 0);
    const diffSrc = src == null ? null : Number((totalsAll.contratadoTotal - src).toFixed(2));
    const diffDst = dst == null ? null : Number((totalsAll.adequadoTotal - dst).toFixed(2));
    return { src, dst, diffSrc, diffDst };
  }, [selectedSource, selectedTarget, totalsAll.adequadoTotal, totalsAll.contratadoTotal]);

  const breadcrumbButtons = useMemo(() => {
    const obraLabel = obraNome ? String(obraNome).trim() : "";
    return [
      { label: "Engenharia", href: "/dashboard/engenharia/painel" },
      { label: "Obras", href: "/dashboard/engenharia/obras" },
      { label: obraLabel ? obraLabel : "Obra", href: `/dashboard/engenharia/obras/${idObra}` },
      { label: "Planilha", href: `/dashboard/engenharia/obras/${idObra}/planilha` },
    ];
  }, [idObra, obraNome]);

  const visibleRows = useMemo(() => {
    if (!rows.length) return [];
    const base = somenteItens ? rows.filter((r) => r.tipoLinha !== "SERVICO") : rows;

    const q = (v: any) => String(v ?? "").trim().toLowerCase();
    const qNum = (v: any) => q(v).replace(/\s+/g, "").replace(/,/g, ".");
    const f = {
      item: q(gridFilter.item),
      servicos: q(gridFilter.servicos),
      und: q(gridFilter.und),
      contratadoQuant: qNum(gridFilter.contratadoQuant),
      contratadoPreco: qNum(gridFilter.contratadoPreco),
      contratadoTotal: qNum(gridFilter.contratadoTotal),
    };
    if (!Object.values(f).some(Boolean)) return base;

    return base.filter((r) => {
      if (f.item && !q(r.item).includes(f.item)) return false;
      if (f.servicos && !q(r.servicos).includes(f.servicos)) return false;
      if (f.und && !q(r.und).includes(f.und)) return false;

      const isHeader = r.tipoLinha !== "SERVICO";
      const quant = isHeader ? "" : qNum(fmtNumberBlankZero(r.contratadoQuant, 2));
      const preco = isHeader ? "" : qNum(fmtNumberBlankZero(r.contratadoPreco, 2));
      const total = qNum(fmtMoneyBlankZero(r.contratadoTotal));

      if (f.contratadoQuant && !quant.includes(f.contratadoQuant)) return false;
      if (f.contratadoPreco && !preco.includes(f.contratadoPreco)) return false;
      if (f.contratadoTotal && !total.includes(f.contratadoTotal)) return false;
      return true;
    });
  }, [rows, somenteItens, gridFilter]);

  const tituloPlanilha = useMemo(() => {
    const nome = String(selectedTarget?.nome || "").trim();
    return nome ? `PLANILHA DE ADEQUAÇÃO DE SERVIÇOS - ${nome}` : "PLANILHA DE ADEQUAÇÃO DE SERVIÇOS";
  }, [selectedTarget?.nome]);

  async function carregarAdequacao() {
    const src = Number(String(sourcePlanilhaId || "").trim() || 0);
    const dst = Number(String(targetPlanilhaId || "").trim() || 0);
    if (!src || !dst) {
      setRows([]);
      return;
    }
    if (src === dst) {
      setErr("Escolha uma origem diferente do destino.");
      setRows([]);
      return;
    }
    try {
      setLoading(true);
      setErr(null);
      const qs = new URLSearchParams();
      qs.set("sourcePlanilhaId", String(src));
      qs.set("targetPlanilhaId", String(dst));
      const res = await authFetch(`/api/v1/engenharia/obras/${idObra}/planilha/adequacao?${qs.toString()}`);
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.message || "Erro ao gerar adequação");
      const list = Array.isArray(json.data?.rows) ? (json.data.rows as any[]) : [];
      setRows(
        list.map((r) => ({
          tipoLinha: String(r.tipoLinha || "ITEM") as any,
          item: String(r.item || ""),
          servicos: String(r.servicos || ""),
          und: String(r.und || ""),
          contratadoQuant: Number(r.contratadoQuant || 0),
          contratadoPreco: Number(r.contratadoPreco || 0),
          contratadoTotal: Number(r.contratadoTotal || 0),
          qAditado: Number(r.qAditado || 0),
          qSuprimido: Number(r.qSuprimido || 0),
          qAdequado: Number(r.qAdequado || 0),
          vAditado: Number(r.vAditado || 0),
          vSuprimido: Number(r.vSuprimido || 0),
          vAdequado: Number(r.vAdequado || 0),
        }))
      );
    } catch (e: any) {
      setRows([]);
      setErr(e?.message || "Erro ao gerar adequação");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!idObra) return;
    setBootLoading(true);
    setBootDone(false);
    void Promise.all([carregarVersoes(), carregarEmpresaDocumentosLayout(), carregarContratoVinculado()]).finally(() => {
      setBootLoading(false);
      setBootDone(true);
    });
  }, [idObra]);

  useEffect(() => {
    const locked = Boolean(String(planilhaIdFromQs || "").trim());
    if (!locked) return;
    const id = String(planilhaIdFromQs || "").trim();
    if (id) setTargetPlanilhaId(id);
  }, [planilhaIdFromQs]);

  useEffect(() => {
    if (!bootDone) return;
    void carregarAdequacao();
  }, [bootDone, sourcePlanilhaId, targetPlanilhaId]);

  function exportarCsv() {
    const src = selectedTarget?.idPlanilha ? selectedTarget.idPlanilha : 0;
    const sep = ";";
    const header = [
      "item",
      "servicos",
      "und",
      "contratado_quant",
      "contratado_preco",
      "contratado_total",
      "q_aditado",
      "q_suprimido",
      "q_adequado",
      "v_aditado",
      "v_suprimido",
      "v_adequado",
    ].join(sep);
    const lines = rows.map((r) =>
      [
        r.item,
        String(r.servicos || "").replace(/\s+/g, " ").trim(),
        r.und,
        fmtNumber(r.contratadoQuant, 2),
        fmtNumber(r.contratadoPreco, 2),
        fmtNumber(r.contratadoTotal, 2),
        fmtNumber(r.qAditado, 2),
        fmtNumber(r.qSuprimido, 2),
        fmtNumber(r.qAdequado, 2),
        fmtNumber(r.vAditado, 2),
        fmtNumber(r.vSuprimido, 2),
        fmtNumber(r.vAdequado, 2),
      ].join(sep)
    );
    downloadCsv(`adequacao_planilha_obra_${idObra}_dest_${src || "x"}.csv`, `${header}\n${lines.join("\n")}\n`);
  }

  function imprimirAdequacao() {
    if (!visibleRows.length) return;
    const w = window.open("", "_blank");
    if (!w) {
      window.print();
      return;
    }

    const pp = uiPrefs.print;
    const repeatDados = pp.repeatDadosEmTodasFolhas !== false;
    const headerFontWeight = pp.headerFontWeight === "bold" ? 700 : pp.headerFontWeight === "normal" ? 400 : 600;
    const margemSuperiorAdicionalPx = Math.max(0, Number(pp.margemSuperiorAdicionalPx || 0));
    const espacoAposCabecalhoPx = Math.max(0, Number(pp.espacoAposCabecalhoPx || 0));
    const espacoAposQuadroPx = Math.max(0, Number(pp.espacoAposQuadroPx || 0));

    const cabecalhoEmpresaHtml =
      pp.includeEmpresaHeader && (empresaDocumentosLayout?.cabecalhoHtml || empresaDocumentosLayout?.logoDataUrl)
        ? `<div class="empresa-cabecalho" style="${empresaDocumentosLayout?.cabecalhoAlturaMm ? `min-height:${Number(empresaDocumentosLayout.cabecalhoAlturaMm)}mm;` : ""}">
            ${empresaDocumentosLayout?.cabecalhoHtml ? applyEmpresaDocTokens(empresaDocumentosLayout.cabecalhoHtml, empresaDocumentosLayout) : ""}
          </div>`
        : "";

    const rodapeEmpresaHtml =
      empresaDocumentosLayout?.rodapeHtml || empresaDocumentosLayout?.logoDataUrl
        ? `<div class="empresa-rodape" style="${empresaDocumentosLayout?.rodapeAlturaMm ? `min-height:${Number(empresaDocumentosLayout.rodapeAlturaMm)}mm;` : ""}">
            ${empresaDocumentosLayout?.rodapeHtml ? applyEmpresaDocTokens(empresaDocumentosLayout.rodapeHtml, empresaDocumentosLayout) : ""}
          </div>`
        : "";

    const contratoOut = String(contratoNumero || "").trim() || (contratoId != null ? `#${contratoId}` : "");
    const objetoOut = String(contratoObjeto || "").trim() || "-";
    const contratanteOut = String(contratanteNome || "").trim() || "-";

    const fmtPercent = (n: unknown) => {
      const num = typeof n === "number" ? n : n == null || n === "" ? null : Number(n);
      if (num == null || !Number.isFinite(num)) return "-";
      return `${num.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
    };

    const dataBaseSinapiOut = String(dstParams?.dataBaseSinapi || "").trim() || "-";
    const descontoOut = fmtPercent(dstParams?.descontoSinapi);
    const bdiServicosOut = fmtPercent(dstParams?.bdiServicosSinapi);
    const bdiDiferenciadoOut = fmtPercent(dstParams?.bdiDiferenciadoSinapi);
    const encargosOut =
      dstParams?.encSociaisSemDesSinapi != null || dstParams?.encSociaisSemDesSbc != null ? "Não desonerado" : "-";

    const concedente = contratoValorConcedente != null && Number.isFinite(contratoValorConcedente) ? Number(contratoValorConcedente) : null;
    const rp = contratoValorRecursosProprio != null && Number.isFinite(contratoValorRecursosProprio) ? Number(contratoValorRecursosProprio) : null;
    const fonteRecursoOut = (() => {
      if (concedente == null && rp == null) return "-";
      const c = concedente != null ? concedente : 0;
      const r = rp != null ? rp : 0;
      if (c <= 0 && r > 0) return "Recursos próprio";
      if (r <= 0 && c > 0) return "Convênio";
      if (c > 0 && r > 0) return "Convênio e RP";
      return "-";
    })();

    const dadosHtml = `
      <div class="dados-bloco">
        <div class="dados-left">
          <div class="dl-row"><span class="dl-k">Objeto:</span><span class="dl-v">${escapeHtml(objetoOut)}</span></div>
          <div class="dl-row2">
            <span class="dl-k">Nº Contrato:</span><span class="dl-v">${escapeHtml(contratoOut || "-")}</span>
            <span class="dl-k">Contratante:</span><span class="dl-v">${escapeHtml(contratanteOut)}</span>
          </div>
        </div>
        <div class="dados-right">
          <div class="dr-cell"><span class="dr-k">Data base SINAPI:</span><span class="dr-v">${escapeHtml(dataBaseSinapiOut)}</span></div>
          <div class="dr-cell"><span class="dr-k">Desconto da Licitação:</span><span class="dr-v">${escapeHtml(descontoOut)}</span></div>
          <div class="dr-cell"><span class="dr-k">BDI de serviços:</span><span class="dr-v">${escapeHtml(bdiServicosOut)}</span></div>
          <div class="dr-cell"><span class="dr-k">Fonte de Recurso:</span><span class="dr-v">${escapeHtml(fonteRecursoOut)}</span></div>
          <div class="dr-cell"><span class="dr-k">BDI diferenciado:</span><span class="dr-v">${escapeHtml(bdiDiferenciadoOut)}</span></div>
          <div class="dr-cell"><span class="dr-k">Encargos Sociais:</span><span class="dr-v">${escapeHtml(encargosOut)}</span></div>
        </div>
      </div>
    `;

    const colgroupHtml = `
      <colgroup>
        <col style="width:${uiPrefs.wItemPx}px" />
        <col style="width:${uiPrefs.wServicosPx}px" />
        <col style="width:${uiPrefs.wUndPx}px" />
        <col style="width:${uiPrefs.wNumPx}px" />
        <col style="width:${uiPrefs.wNumPx}px" />
        <col style="width:${uiPrefs.wNumPx}px" />
        <col style="width:${uiPrefs.wNumPx}px" />
        <col style="width:${uiPrefs.wNumPx}px" />
        <col style="width:${uiPrefs.wNumPx}px" />
        <col style="width:${uiPrefs.wNumPx}px" />
        <col style="width:${uiPrefs.wNumPx}px" />
        <col style="width:${uiPrefs.wNumPx}px" />
      </colgroup>
    `;

    const rowsHtml = visibleRows
      .map((r) => {
        const tipo = String(r.tipoLinha || "");
        const isItem = tipo === "ITEM";
        const isSubitem = tipo === "SUBITEM";
        const isHeader = tipo !== "SERVICO";
        const bg = isItem ? uiPrefs.itemBg : isSubitem ? uiPrefs.subitemBg : "";
        const style = `${isHeader ? "font-weight:700;" : ""}${bg ? `background:${escapeHtml(bg)};` : ""}`;
        const show = (v: string) => escapeHtml(v || "—");
        const isZero2 = (v: number) => isRoundedZero(v, 2);
        const n2 = (v: number) => (isZero2(v) ? "" : escapeHtml(fmtNumber(v, 2)));
        const money = (v: number) => (isZero2(v) ? "" : escapeHtml(fmtMoney(v)));
        const blue = uiPrefs.colorDiff && !isHeader && Number(r.qAditado || 0) > 0;
        const red = uiPrefs.colorDiff && !isHeader && Number(r.qSuprimido || 0) > 0;
        const blueV = uiPrefs.colorDiff && Number(r.vAditado || 0) > 0;
        const redV = uiPrefs.colorDiff && Number(r.vSuprimido || 0) > 0;
        const tdBlue = (content: string) => `<td class="t-right diff-add">${content}</td>`;
        const tdRed = (content: string) => `<td class="t-right diff-sub">${content}</td>`;
        const tdR = (content: string) => `<td class="t-right">${content}</td>`;
        const tdRBlueIf = (cond: boolean, content: string) => (cond ? tdBlue(content) : tdR(content));
        const tdRRedIf = (cond: boolean, content: string) => (cond ? tdRed(content) : tdR(content));

        return `<tr style="${style}">
          <td>${show(r.item)}</td>
          <td>${show(r.servicos)}</td>
          <td>${isHeader ? "" : show(r.und)}</td>
          <td style="text-align:right">${isHeader ? "" : n2(r.contratadoQuant)}</td>
          <td style="text-align:right">${isHeader ? "" : n2(r.contratadoPreco)}</td>
          ${tdR(money(r.contratadoTotal))}
          ${isHeader ? `<td></td><td></td><td></td>` : `${tdRBlueIf(blue, n2(r.qAditado))}${tdRRedIf(red, n2(r.qSuprimido))}${tdR(n2(r.qAdequado))}`}
          ${tdRBlueIf(blueV, money(r.vAditado))}
          ${tdRRedIf(redV, money(r.vSuprimido))}
          ${tdR(money(r.vAdequado))}
        </tr>`;
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
      @page { size: A4 landscape; margin: 10mm; }
      body { font-family: Arial, sans-serif; margin: 0; color: #0f172a; font-size: ${Number(uiPrefs.fontSizePx)}px; line-height: 1.12; }
      @media print {
        body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        thead { display: table-header-group !important; }
        tfoot { display: table-footer-group !important; }
        table { page-break-inside: auto; }
        tbody tr { break-inside: avoid; page-break-inside: avoid; }
      }
      .print-content { padding: 0; }
      thead { display: table-header-group; }
      .empresa-cabecalho { width: 100%; font-family: ${escapeHtml(pp.headerFontFamily)}; font-size: ${Number(pp.headerFontSizePx || 11)}px; }
      .empresa-cabecalho, .empresa-cabecalho * { line-height: 1.12; }
      .empresa-rodape { width: 100%; margin-top: 14px; }
      table { width: 100%; border-collapse: collapse; margin-top: 0; }
      th, td { border: 1px solid #cbd5e1; padding: 4px 6px; vertical-align: top; }
      thead th { background: #f8fafc; }
      .thead-rowspan-top { border-bottom: 0; }
      .thead-rowspan-bottom { border-top: 0; background: #f8fafc; }
      .t-center { text-align: center; }
      .t-right { text-align: right; }
      .thead-noborder { border: 0 !important; padding: 0 !important; background: #ffffff !important; }
      .spacer { border: 0 !important; padding: 0 !important; background: #ffffff !important; }
      .dados-wrap { background:#ffffff; border:0; padding:0; }
      .dados-wrap, .dados-wrap * { text-align: left; }
      .dados-bloco { border: 2px solid #0f172a; display:grid; grid-template-columns: 1.65fr 1fr; }
      .dados-left { padding: 6px 8px; }
      .dados-right { border-left: 2px solid #0f172a; padding: 6px 8px; display:grid; grid-template-columns: 1fr 1fr; gap: 6px 22px; align-content: start; }
      .dl-row { display:grid; grid-template-columns: 92px 1fr; gap: 8px; align-items: baseline; font-size: ${Math.max(10, Math.min(16, Number(pp.headerFontSizePx || 11)))}px; }
      .dl-row + .dl-row { margin-top: 4px; }
      .dl-row2 { display:grid; grid-template-columns: 92px minmax(120px, 180px) 92px 1fr; gap: 8px; align-items: baseline; font-size: ${Math.max(10, Math.min(16, Number(pp.headerFontSizePx || 11)))}px; margin-top: 4px; }
      .dl-k { font-weight: ${headerFontWeight}; }
      .dl-v { font-weight: 700; }
      .dr-cell { display:flex; gap: 8px; align-items: baseline; font-size: ${Math.max(10, Math.min(16, Number(pp.headerFontSizePx || 11)))}px; }
      .dr-k { font-weight: ${headerFontWeight}; }
      .dr-v { font-weight: 700; }
      .diff-add { color:#1d4ed8; }
      .diff-sub { color:#b91c1c; }
    </style>
  </head>
  <body>
    <div class="print-content">
      <table>
        ${colgroupHtml}
        <thead>
          ${margemSuperiorAdicionalPx > 0 ? `<tr><th colspan="12" class="spacer" style="height:${margemSuperiorAdicionalPx}px;"></th></tr>` : ""}
          ${pp.includeEmpresaHeader ? `<tr><th colspan="12" class="thead-noborder">${cabecalhoEmpresaHtml}</th></tr>` : ""}
          ${pp.includeEmpresaHeader && espacoAposCabecalhoPx > 0 ? `<tr><th colspan="12" class="spacer" style="height:${espacoAposCabecalhoPx}px;"></th></tr>` : ""}
          ${repeatDados ? `<tr><th colspan="12" class="thead-noborder">${dadosHtml}</th></tr>` : ""}
          ${repeatDados && espacoAposQuadroPx > 0 ? `<tr><th colspan="12" class="spacer" style="height:${espacoAposQuadroPx}px;"></th></tr>` : ""}
          <tr>
            <th class="thead-rowspan-top">ITEM</th>
            <th class="thead-rowspan-top">SERVIÇOS</th>
            <th class="thead-rowspan-top">UND</th>
            <th class="t-center" colspan="3">CONTRATADO</th>
            <th class="t-center" colspan="3">QUANTIDADES</th>
            <th class="t-center" colspan="3">VALORES</th>
          </tr>
          <tr>
            <th class="thead-rowspan-bottom"></th>
            <th class="thead-rowspan-bottom"></th>
            <th class="thead-rowspan-bottom"></th>
            <th class="t-right">QUANT.</th>
            <th class="t-right">PREÇO</th>
            <th class="t-right">TOTAL</th>
            <th class="t-right">ADITADO</th>
            <th class="t-right">SUPRIMIDO</th>
            <th class="t-right">ADEQUADO</th>
            <th class="t-right">ADITADO</th>
            <th class="t-right">SUPRIMIDO</th>
            <th class="t-right">ADEQUADO</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
        </tbody>
      </table>
      ${rodapeEmpresaHtml}
    </div>
  </body>
</html>`);
    w.document.close();
    try {
      w.focus();
      w.print();
    } catch {}
  }

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-7xl text-slate-900">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="text-xs text-slate-500 flex flex-wrap items-center gap-1">
            {breadcrumbButtons.map((b, idx) => (
              <span key={b.href} className="inline-flex items-center gap-1">
                <button
                  className="hover:underline"
                  type="button"
                  onClick={() => router.push(b.href)}
                  disabled={loading}
                  title={b.label}
                >
                  {b.label}
                </button>
                <span className="text-slate-400">{idx < breadcrumbButtons.length - 1 ? "→" : ""}</span>
              </span>
            ))}
            <span className="text-slate-400">→</span>
            <span>Adequação entre versões</span>
          </div>
          <h1 className="text-2xl font-semibold">Adequação entre versões</h1>
          <div className="text-sm text-slate-600">Consulta de diferenças entre duas versões da planilha (origem x destino).</div>
          <div className="mt-1 text-sm text-slate-600">{bootLoading ? "Carregando página…" : bootDone ? "Página carregada" : ""}</div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <PageLoadStatusBadge loading={bootLoading || loading} done={bootDone && !bootLoading && !loading} />
          <button
            className="rounded-lg border bg-white px-4 py-2 text-sm hover:bg-slate-50 disabled:opacity-60"
            type="button"
            onClick={carregarVersoes}
            disabled={loading}
            title="Recarregar lista de versões"
          >
            Atualizar
          </button>
          <button
            className="rounded-lg border bg-white px-4 py-2 text-sm hover:bg-slate-50 disabled:opacity-60"
            type="button"
            onClick={() => router.push(safeReturnTo || `/dashboard/engenharia/obras/${idObra}/planilha`)}
            disabled={loading}
            title="Voltar"
          >
            Voltar
          </button>
        </div>
      </div>

      {err ? <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div> : null}

      <section className="rounded-xl border bg-white p-4 shadow-sm space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="text-lg font-semibold">Configuração</div>
          <div className="flex items-center gap-2">
            <button
              className="rounded-lg border bg-white px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-60 inline-flex items-center gap-2"
              type="button"
              onClick={() => setShowVisual((v) => !v)}
              disabled={loading}
              title={showVisual ? "Ocultar card Visual" : "Exibir card Visual"}
            >
              {showVisual ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
            <button
              className="rounded-lg border bg-white px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-60 inline-flex items-center gap-2"
              type="button"
              onClick={imprimirAdequacao}
              disabled={loading || !visibleRows.length}
              title="Imprimir (cabeçalho padrão da empresa + tabela, em paisagem)"
            >
              <Printer className="h-4 w-4" />
              Imprimir
            </button>
            <button
              className="rounded-lg border bg-white px-3 py-2 text-sm hover:bg-slate-50 inline-flex items-center gap-2 disabled:opacity-60"
              type="button"
              onClick={() => setShowPrintConfig((v) => !v)}
              disabled={loading}
              title="Configurar impressão"
            >
              <Image className="h-4 w-4" />
            </button>
            <button
              className="rounded-lg border bg-white px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-60 inline-flex items-center gap-2"
              type="button"
              onClick={exportarCsv}
              disabled={loading || !visibleRows.length}
              title="Exportar a grade para CSV (separador ;)"
            >
              <FileSpreadsheet className="h-4 w-4" />
              CSV
            </button>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <label className="space-y-1">
            <div className="text-sm text-slate-600">Planilha anterior</div>
            <select
              className="input bg-white w-full"
              value={sourcePlanilhaId}
              onChange={(e) => setSourcePlanilhaId(e.target.value)}
              disabled={loading}
              title="Versão anterior: usada como referência do Contratado"
            >
              <option value="">(selecione)</option>
              {versoes.map((v) => (
                <option key={v.idPlanilha} value={String(v.idPlanilha)}>
                  {`#${v.idPlanilha} — v${v.numeroVersao} ${v.atual ? "(atual)" : ""} ${v.nome ? `— ${v.nome}` : ""}`}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1">
            <div className="text-sm font-semibold text-slate-800">Planilha Adequada</div>
            <select
              className="input bg-white w-full text-base font-semibold"
              value={targetPlanilhaId}
              onChange={(e) => setTargetPlanilhaId(e.target.value)}
              disabled={loading || Boolean(String(planilhaIdFromQs || "").trim())}
              title={
                Boolean(String(planilhaIdFromQs || "").trim())
                  ? "Destino fixado na planilha selecionada (aberto a partir da Planilha)"
                  : "Versão adequada: usada como referência do Adequado"
              }
            >
              <option value="">(selecione)</option>
              {versoes.map((v) => (
                <option key={v.idPlanilha} value={String(v.idPlanilha)}>
                  {`#${v.idPlanilha} — v${v.numeroVersao} ${v.atual ? "(atual)" : ""} ${v.nome ? `— ${v.nome}` : ""}`}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <section className="rounded-xl border bg-white p-4 shadow-sm space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <div className="text-lg font-semibold">Totais (validação)</div>
            <div className="text-sm text-slate-600">Os totais abaixo devem bater com os totais das versões selecionadas.</div>
          </div>
        </div>

        {(totalsDiff.diffSrc != null && Math.abs(totalsDiff.diffSrc) >= 0.01) || (totalsDiff.diffDst != null && Math.abs(totalsDiff.diffDst) >= 0.01) ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            Há divergência entre os totais da Adequação e os totais da Planilha. Isso normalmente acontece por arredondamento ou por alguma linha de serviço com dados inconsistentes
            (ex.: serviço sem valor parcial, serviço duplicado com item/código diferente, etc.). Use este quadro para localizar qual versão está divergindo.
          </div>
        ) : (
          <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">OK: totais da Adequação coerentes com as versões selecionadas.</div>
        )}

        <div className="grid gap-3 md:grid-cols-4">
          <div
            className="rounded-lg border bg-white p-3"
            title='Soma dos valores "Contratado" (linhas de SERVIÇO) calculados pela Adequação para a versão anterior. Deve bater com "Valor total (Versão anterior)".'
          >
            <div className="text-[11px] uppercase tracking-wide text-slate-500">Contratado (Adequação)</div>
            <div className="mt-1 text-sm font-semibold text-slate-900">{fmtMoney(totalsAll.contratadoTotal)}</div>
            <div className="mt-1 text-xs text-slate-500">{selectedSource ? `Versão anterior: v${selectedSource.numeroVersao}` : "Selecione a versão anterior"}</div>
          </div>
          <div
            className="rounded-lg border bg-white p-3"
            title='Total oficial da versão anterior na Planilha orçamentária (somatório do VALOR PARCIAL das linhas de SERVIÇO).'
          >
            <div className="text-[11px] uppercase tracking-wide text-slate-500">Valor total (Versão anterior)</div>
            <div className="mt-1 text-sm font-semibold text-slate-900">{selectedSource?.valorTotal == null ? "—" : fmtMoney(Number(selectedSource.valorTotal || 0))}</div>
            <div
              className={`mt-1 text-xs ${totalsDiff.diffSrc != null && Math.abs(totalsDiff.diffSrc) >= 0.01 ? "text-amber-800 font-semibold" : "text-slate-500"}`}
              title='Diferença = Contratado (Adequação) - Valor total (Versão anterior). Deve ser 0,00 (pode variar por arredondamento).'
            >
              {totalsDiff.diffSrc == null ? "—" : `Dif.: ${fmtMoney(totalsDiff.diffSrc)}`}
            </div>
          </div>
          <div
            className="rounded-lg border bg-white p-3"
            title='Soma dos valores "Adequado" (linhas de SERVIÇO) calculados pela Adequação para a versão adequada. Deve bater com "Valor total (Versão adequada)".'
          >
            <div className="text-[11px] uppercase tracking-wide text-slate-500">Adequado (Adequação)</div>
            <div className="mt-1 text-sm font-semibold text-slate-900">{fmtMoney(totalsAll.adequadoTotal)}</div>
            <div className="mt-1 text-xs text-slate-500">{selectedTarget ? `Versão adequada: v${selectedTarget.numeroVersao}` : "Selecione a versão adequada"}</div>
          </div>
          <div
            className="rounded-lg border bg-white p-3"
            title='Total oficial da versão adequada na Planilha orçamentária (somatório do VALOR PARCIAL das linhas de SERVIÇO).'
          >
            <div className="text-[11px] uppercase tracking-wide text-slate-500">Valor total (Versão adequada)</div>
            <div className="mt-1 text-sm font-semibold text-slate-900">{selectedTarget?.valorTotal == null ? "—" : fmtMoney(Number(selectedTarget.valorTotal || 0))}</div>
            <div
              className={`mt-1 text-xs ${totalsDiff.diffDst != null && Math.abs(totalsDiff.diffDst) >= 0.01 ? "text-amber-800 font-semibold" : "text-slate-500"}`}
              title='Diferença = Adequado (Adequação) - Valor total (Versão adequada). Deve ser 0,00 (pode variar por arredondamento).'
            >
              {totalsDiff.diffDst == null ? "—" : `Dif.: ${fmtMoney(totalsDiff.diffDst)}`}
            </div>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <div
            className="rounded-lg border bg-white p-3"
            title='Soma de todos os aumentos (entradas ou acréscimos) ao comparar a versão adequada com a anterior. Se v2 for igual à v1, este total fica 0,00.'
          >
            <div className="text-[11px] uppercase tracking-wide text-slate-500">Total aditado (Adequação)</div>
            <div className="mt-1 text-sm font-semibold text-slate-900">{fmtMoney(totalsAll.vAditado)}</div>
          </div>
          <div
            className="rounded-lg border bg-white p-3"
            title='Soma de todas as reduções (saídas ou supressões) ao comparar a versão adequada com a anterior. É exibido como valor positivo.'
          >
            <div className="text-[11px] uppercase tracking-wide text-slate-500">Total suprimido (Adequação)</div>
            <div className="mt-1 text-sm font-semibold text-slate-900">{fmtMoney(totalsAll.vSuprimido)}</div>
          </div>
          <div
            className="rounded-lg border bg-white p-3"
            title='Diferença = Adequado - Contratado. Também equivale a (Total aditado - Total suprimido). Valor negativo indica que a versão adequada ficou menor.'
          >
            <div className="text-[11px] uppercase tracking-wide text-slate-500">Diferença (Adequado - Contratado)</div>
            <div className="mt-1 text-sm font-semibold text-slate-900">{fmtMoney(Number((totalsAll.adequadoTotal - totalsAll.contratadoTotal).toFixed(2)))}</div>
          </div>
        </div>
      </section>

      {showVisual ? (
        <div className="rounded-lg border bg-white p-3 space-y-3">
        <div className="text-sm font-semibold">Visual</div>
        <div className="flex items-center gap-3 flex-wrap">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={somenteItens}
              onChange={(e) => setSomenteItens(Boolean(e.target.checked))}
              title="Se marcado, mostra apenas Itens e Subitens (oculta linhas de Serviço)"
            />
            <span className="text-slate-600">Somente itens</span>
          </label>
          <label className="flex items-center gap-2 text-sm">
            <span className="text-slate-600">Fonte</span>
            <select
              className="input bg-white"
              value={String(uiPrefs.fontSizePx)}
              onChange={(e) => setUiPrefs((p) => ({ ...p, fontSizePx: Number(e.target.value || 14) }))}
              title="Tamanho da fonte da tabela"
            >
              <option value="12">12</option>
              <option value="14">14</option>
              <option value="16">16</option>
              <option value="18">18</option>
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm">
            <span className="text-slate-600">Fundo Item</span>
            <input
              type="color"
              value={uiPrefs.itemBg}
              onChange={(e) => setUiPrefs((p) => ({ ...p, itemBg: e.target.value }))}
              title="Cor de fundo das linhas do tipo Item"
            />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <span className="text-slate-600">Fundo Subitem</span>
            <input
              type="color"
              value={uiPrefs.subitemBg}
              onChange={(e) => setUiPrefs((p) => ({ ...p, subitemBg: e.target.value }))}
              title="Cor de fundo das linhas do tipo Subitem"
            />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={uiPrefs.colorDiff}
              onChange={(e) => setUiPrefs((p) => ({ ...p, colorDiff: Boolean(e.target.checked) }))}
              title="Se marcado, destaca ADITADO em azul e SUPRIMIDO em vermelho (quantidades e valores)"
            />
            <span className="text-slate-600">Cor aditado/suprimido</span>
          </label>
          <div className="flex items-center gap-2 text-sm">
            <span className="text-slate-600">Colunas (px)</span>
            <label className="flex items-center gap-2">
              <span className="text-xs text-slate-500">Item</span>
              <input
                className="input bg-white w-[92px]"
                type="number"
                min={56}
                max={200}
                value={uiPrefs.wItemPx}
                onChange={(e) => setUiPrefs((p) => ({ ...p, wItemPx: Math.max(56, Math.min(200, Number(e.target.value || p.wItemPx))) }))}
                title="Largura da coluna ITEM (px)"
              />
            </label>
            <label className="flex items-center gap-2">
              <span className="text-xs text-slate-500">Serviços</span>
              <input
                className="input bg-white w-[92px]"
                type="number"
                min={260}
                max={1200}
                value={uiPrefs.wServicosPx}
                onChange={(e) => setUiPrefs((p) => ({ ...p, wServicosPx: Math.max(260, Math.min(1200, Number(e.target.value || p.wServicosPx))) }))}
                title="Largura da coluna SERVIÇOS (px)"
              />
            </label>
            <label className="flex items-center gap-2">
              <span className="text-xs text-slate-500">UND</span>
              <input
                className="input bg-white w-[92px]"
                type="number"
                min={40}
                max={140}
                value={uiPrefs.wUndPx}
                onChange={(e) => setUiPrefs((p) => ({ ...p, wUndPx: Math.max(40, Math.min(140, Number(e.target.value || p.wUndPx))) }))}
                title="Largura da coluna UND (px)"
              />
            </label>
            <label className="flex items-center gap-2">
              <span className="text-xs text-slate-500">Num</span>
              <input
                className="input bg-white w-[92px]"
                type="number"
                min={70}
                max={200}
                value={uiPrefs.wNumPx}
                onChange={(e) => setUiPrefs((p) => ({ ...p, wNumPx: Math.max(70, Math.min(200, Number(e.target.value || p.wNumPx))) }))}
                title="Largura das colunas numéricas (px)"
              />
            </label>
          </div>
        </div>
      </div>
      ) : null}

      {showPrintConfig ? (
        <div className="rounded-lg border bg-white p-3 space-y-3">
          <div className="text-sm font-semibold">Impressão — ajustes finos</div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-12">
            <div className="md:col-span-12">
              <label className="flex items-center gap-2 text-sm rounded border bg-white px-3 py-2">
                <input
                  type="checkbox"
                  checked={uiPrefs.print.includeEmpresaHeader}
                  onChange={(e) => setUiPrefs((p) => ({ ...p, print: { ...p.print, includeEmpresaHeader: Boolean(e.target.checked) } }))}
                  title="Inclui o cabeçalho da empresa configurado em Configurações → Empresa → Documentos"
                />
                <span className="text-slate-700">Incluir cabeçalho padronizado da empresa na impressão</span>
              </label>
            </div>
        <div className="md:col-span-12">
          <label className="flex items-center gap-2 text-sm rounded border bg-white px-3 py-2">
            <input
              type="checkbox"
              checked={uiPrefs.print.repeatDadosEmTodasFolhas}
              onChange={(e) => setUiPrefs((p) => ({ ...p, print: { ...p.print, repeatDadosEmTodasFolhas: Boolean(e.target.checked) } }))}
              title="Quando marcado, o quadro de dados é repetido em todas as páginas da impressão. Quando desmarcado, aparece apenas na primeira página."
            />
            <span className="text-slate-700">Repetir quadro de dados em todas as folhas</span>
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
                    title="Fonte usada no cabeçalho"
                  >
                    <option value="Arial">Arial</option>
                    <option value="Calibri">Calibri</option>
                    <option value="Verdana">Verdana</option>
                    <option value="Times New Roman">Times New Roman</option>
                  </select>
                </label>

                <div className="space-y-1">
                  <div className="text-sm text-slate-600">Tamanho</div>
              <input
                className="input bg-white w-[110px]"
                type="number"
                min={8}
                max={16}
                value={uiPrefs.print.headerFontSizePx}
                onChange={(e) =>
                  setUiPrefs((p) => ({ ...p, print: { ...p.print, headerFontSizePx: Math.max(8, Math.min(16, Number(e.target.value || 11))) } }))
                }
                title="Tamanho da fonte do cabeçalho (px)"
              />
                </div>

                <label className="space-y-1">
                  <div className="text-sm text-slate-600">Peso</div>
                  <select
                    className="input bg-white"
                    value={uiPrefs.print.headerFontWeight}
                    onChange={(e) => setUiPrefs((p) => ({ ...p, print: { ...p.print, headerFontWeight: e.target.value as any } }))}
                    title="Peso da fonte do cabeçalho"
                  >
                    <option value="normal">Normal</option>
                    <option value="semibold">Semibold</option>
                    <option value="bold">Bold</option>
                  </select>
                </label>
              </div>
            </div>

            <div className="md:col-span-7 space-y-2">
              <button
                className="w-full rounded border bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 text-left"
                type="button"
                onClick={() => setShowPrintAdvanced((v) => !v)}
                title="Ajustes avançados (use apenas em casos excepcionais)"
              >
                Ajustes avançados
              </button>

              {showPrintAdvanced ? (
                <div className="rounded border bg-slate-50 p-3">
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                    <div className="space-y-1">
                      <div className="text-sm text-slate-600">Margem superior adicional (px)</div>
                      <input
                        className="input bg-white w-[150px]"
                        type="number"
                        min={0}
                        max={80}
                        value={uiPrefs.print.margemSuperiorAdicionalPx}
                        onChange={(e) =>
                          setUiPrefs((p) => ({
                            ...p,
                            print: { ...p.print, margemSuperiorAdicionalPx: Math.max(0, Math.min(80, Number(e.target.value || 0))) },
                          }))
                        }
                        title="Aplica um espaçamento extra antes do primeiro bloco da impressão"
                      />
                    </div>

                    <div className="space-y-1">
                      <div className="text-sm text-slate-600">Espaço após cabeçalho (px)</div>
                      <input
                        className="input bg-white w-[150px]"
                        type="number"
                        min={0}
                        max={80}
                        value={uiPrefs.print.espacoAposCabecalhoPx}
                        onChange={(e) =>
                          setUiPrefs((p) => ({
                            ...p,
                            print: { ...p.print, espacoAposCabecalhoPx: Math.max(0, Math.min(80, Number(e.target.value || 0))) },
                          }))
                        }
                        title="Aplica um espaçamento entre o cabeçalho da empresa e o quadro de dados"
                      />
                    </div>

                    <div className="space-y-1">
                      <div className="text-sm text-slate-600">Espaço após quadro de dados (px)</div>
                      <input
                        className="input bg-white w-[150px]"
                        type="number"
                        min={0}
                        max={120}
                        value={uiPrefs.print.espacoAposQuadroPx}
                        onChange={(e) =>
                          setUiPrefs((p) => ({
                            ...p,
                            print: { ...p.print, espacoAposQuadroPx: Math.max(0, Math.min(120, Number(e.target.value || 0))) },
                          }))
                        }
                        title="Aplica um espaçamento entre o quadro de dados e a tabela"
                      />
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      <section className="rounded-xl border bg-white p-4 shadow-sm space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <div className="text-lg font-semibold">{tituloPlanilha}</div>
          </div>
          <div className="flex items-center gap-2">
            <div className="text-sm text-slate-600">
              Linhas: <span className="font-semibold text-slate-900">{rows.length}</span>
            </div>
            <button
              className={`rounded-lg border bg-white p-2 hover:bg-slate-50 disabled:opacity-60 ${hasActiveGridFilter ? "border-blue-200 bg-blue-50 text-blue-700" : "text-slate-800"}`}
              type="button"
              onClick={() => setShowFilters((v) => !v)}
              disabled={loading}
              title={showFilters ? "Ocultar filtros" : "Exibir filtros"}
              aria-label="Filtros"
            >
              <Filter className="h-4 w-4" />
            </button>
          </div>
        </div>

        {showFilters ? (
          <div className="rounded-lg border bg-slate-50 p-3">
            <div className="grid gap-2 md:grid-cols-3">
              <label className="space-y-1">
                <div className="text-xs text-slate-600">ITEM</div>
                <input className="input bg-white w-full" value={gridFilter.item} onChange={(e) => setGridFilter((p) => ({ ...p, item: e.target.value }))} />
              </label>
              <label className="space-y-1">
                <div className="text-xs text-slate-600">SERVIÇOS</div>
                <input className="input bg-white w-full" value={gridFilter.servicos} onChange={(e) => setGridFilter((p) => ({ ...p, servicos: e.target.value }))} />
              </label>
              <label className="space-y-1">
                <div className="text-xs text-slate-600">UND</div>
                <input className="input bg-white w-full" value={gridFilter.und} onChange={(e) => setGridFilter((p) => ({ ...p, und: e.target.value }))} />
              </label>
              <label className="space-y-1">
                <div className="text-xs text-slate-600">QUANT. (contratado)</div>
                <input className="input bg-white w-full" value={gridFilter.contratadoQuant} onChange={(e) => setGridFilter((p) => ({ ...p, contratadoQuant: e.target.value }))} inputMode="decimal" />
              </label>
              <label className="space-y-1">
                <div className="text-xs text-slate-600">VALOR UNIT. (contratado)</div>
                <input className="input bg-white w-full" value={gridFilter.contratadoPreco} onChange={(e) => setGridFilter((p) => ({ ...p, contratadoPreco: e.target.value }))} inputMode="decimal" />
              </label>
              <label className="space-y-1">
                <div className="text-xs text-slate-600">VALOR PARCIAL (contratado)</div>
                <input className="input bg-white w-full" value={gridFilter.contratadoTotal} onChange={(e) => setGridFilter((p) => ({ ...p, contratadoTotal: e.target.value }))} inputMode="decimal" />
              </label>
            </div>
          </div>
        ) : null}

        <div className="overflow-auto max-h-[70vh] rounded-lg border" style={{ fontSize: `${uiPrefs.fontSizePx}px` }}>
          <table className="min-w-[1200px] w-full border-collapse">
            <colgroup>
              <col style={{ width: `${uiPrefs.wItemPx}px` }} />
              <col style={{ width: `${uiPrefs.wServicosPx}px` }} />
              <col style={{ width: `${uiPrefs.wUndPx}px` }} />
              {Array.from({ length: 9 }).map((_, i) => (
                <col key={i} style={{ width: `${uiPrefs.wNumPx}px` }} />
              ))}
            </colgroup>
            <thead className="bg-slate-50 text-left text-slate-700 sticky top-0 z-10">
              <tr className="border-b">
                <th className="px-3 py-2 border border-slate-300" colSpan={12}>
                  <div className="text-center font-semibold">{tituloPlanilha}</div>
                </th>
              </tr>
              <tr className="border-b">
                <th className="px-3 py-2 border border-slate-300">ITEM</th>
                <th className="px-3 py-2 border border-slate-300">SERVIÇOS</th>
                <th className="px-3 py-2 border border-slate-300">UND</th>
                <th className="px-3 py-2 text-center border border-slate-300" colSpan={3}>
                  CONTRATADO
                </th>
                <th className="px-3 py-2 text-center border border-slate-300" colSpan={3}>
                  QUANTIDADES
                </th>
                <th className="px-3 py-2 text-center border border-slate-300" colSpan={3}>
                  VALORES
                </th>
              </tr>
              <tr className="border-b text-xs">
                <th className="px-3 py-2 border border-slate-300" />
                <th className="px-3 py-2 border border-slate-300" />
                <th className="px-3 py-2 border border-slate-300" />
                <th className="px-3 py-2 text-right border border-slate-300">QUANT.</th>
                <th className="px-3 py-2 text-right border border-slate-300">PREÇO</th>
                <th className="px-3 py-2 text-right border border-slate-300">TOTAL</th>
                <th className="px-3 py-2 text-right border border-slate-300">ADITADO</th>
                <th className="px-3 py-2 text-right border border-slate-300">SUPRIMIDO</th>
                <th className="px-3 py-2 text-right border border-slate-300">ADEQUADO</th>
                <th className="px-3 py-2 text-right border border-slate-300">ADITADO</th>
                <th className="px-3 py-2 text-right border border-slate-300">SUPRIMIDO</th>
                <th className="px-3 py-2 text-right border border-slate-300">ADEQUADO</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((r, idx) => {
                const isHeader = r.tipoLinha !== "SERVICO";
                const isItem = r.tipoLinha === "ITEM";
                const isSubitem = r.tipoLinha === "SUBITEM";
                const bg = isItem ? uiPrefs.itemBg : isSubitem ? uiPrefs.subitemBg : "";
                return (
                  <tr key={`${r.tipoLinha}-${r.item}-${idx}`} style={bg ? { background: bg } : undefined}>
                    <td className={`px-3 py-2 border border-slate-300 ${isHeader ? "font-semibold" : ""}`}>{r.item || "—"}</td>
                    <td className={`px-3 py-2 border border-slate-300 ${isHeader ? "font-semibold" : ""}`}>{r.servicos || "—"}</td>
                    <td className="px-3 py-2 border border-slate-300">{isHeader ? "" : r.und || ""}</td>
                    <td className="px-3 py-2 text-right border border-slate-300">{isHeader ? "" : fmtNumberBlankZero(r.contratadoQuant, 2)}</td>
                    <td className="px-3 py-2 text-right border border-slate-300">{isHeader ? "" : fmtNumberBlankZero(r.contratadoPreco, 2)}</td>
                    <td className="px-3 py-2 text-right border border-slate-300">{fmtMoneyBlankZero(r.contratadoTotal)}</td>
                    <td
                      className={`px-3 py-2 text-right border border-slate-300 ${
                        uiPrefs.colorDiff && !isHeader && Number(r.qAditado || 0) > 0 ? "text-blue-700" : ""
                      }`}
                    >
                      {isHeader ? "" : fmtNumberBlankZero(r.qAditado, 2)}
                    </td>
                    <td
                      className={`px-3 py-2 text-right border border-slate-300 ${
                        uiPrefs.colorDiff && !isHeader && Number(r.qSuprimido || 0) > 0 ? "text-red-700" : ""
                      }`}
                    >
                      {isHeader ? "" : fmtNumberBlankZero(r.qSuprimido, 2)}
                    </td>
                    <td className="px-3 py-2 text-right border border-slate-300">{isHeader ? "" : fmtNumberBlankZero(r.qAdequado, 2)}</td>
                    <td
                      className={`px-3 py-2 text-right border border-slate-300 ${
                        uiPrefs.colorDiff && Number(r.vAditado || 0) > 0 ? "text-blue-700" : ""
                      }`}
                    >
                      {fmtMoneyBlankZero(r.vAditado)}
                    </td>
                    <td
                      className={`px-3 py-2 text-right border border-slate-300 ${
                        uiPrefs.colorDiff && Number(r.vSuprimido || 0) > 0 ? "text-red-700" : ""
                      }`}
                    >
                      {fmtMoneyBlankZero(r.vSuprimido)}
                    </td>
                    <td className="px-3 py-2 text-right border border-slate-300">{fmtMoneyBlankZero(r.vAdequado)}</td>
                  </tr>
                );
              })}
              {!visibleRows.length ? (
                <tr className="border-t">
                  <td className="px-3 py-6 text-center text-slate-500" colSpan={12}>
                    Selecione origem e destino para gerar a adequação.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
