"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { FileSpreadsheet, Image, Printer } from "lucide-react";
import { PageLoadStatusBadge } from "@/components/PageLoadStatus";

type VersaoRow = {
  idPlanilha: number;
  numeroVersao: number;
  nome: string;
  atual: boolean;
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
  const [versoes, setVersoes] = useState<VersaoRow[]>([]);
  const [sourcePlanilhaId, setSourcePlanilhaId] = useState<string>("");
  const [targetPlanilhaId, setTargetPlanilhaId] = useState<string>(planilhaIdFromQs ? String(planilhaIdFromQs) : "");

  const [showPrintConfig, setShowPrintConfig] = useState(false);
  const [somenteItens, setSomenteItens] = useState(false);
  const [uiPrefs, setUiPrefs] = useState<{
    fontSizePx: number;
    itemBg: string;
    subitemBg: string;
    wItemPx: number;
    wServicosPx: number;
    wUndPx: number;
    wNumPx: number;
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
    fontSizePx: 14,
    itemBg: "#F8FAFC",
    subitemBg: "#FFFFFF",
    wItemPx: 80,
    wServicosPx: 620,
    wUndPx: 52,
    wNumPx: 92,
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

  const [rows, setRows] = useState<AdequacaoRow[]>([]);

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
        wItemPx: n(parsed?.wItemPx, 56, 200, cur.wItemPx),
        wServicosPx: n(parsed?.wServicosPx, 260, 1200, cur.wServicosPx),
        wUndPx: n(parsed?.wUndPx, 40, 140, cur.wUndPx),
        wNumPx: n(parsed?.wNumPx, 70, 200, cur.wNumPx),
        print: {
          headerFontFamily: typeof parsed?.print?.headerFontFamily === "string" && String(parsed.print.headerFontFamily).trim() ? String(parsed.print.headerFontFamily).trim() : cur.print.headerFontFamily,
          headerFontSizePx: n(parsed?.print?.headerFontSizePx, 8, 16, cur.print.headerFontSizePx),
          headerFontWeight: (["normal", "semibold", "bold"].includes(String(parsed?.print?.headerFontWeight)) ? parsed.print.headerFontWeight : cur.print.headerFontWeight) as any,
          topToHeaderPx: n(parsed?.print?.topToHeaderPx, 0, 80, cur.print.topToHeaderPx),
          headerToDadosPx: n(parsed?.print?.headerToDadosPx, 0, 80, cur.print.headerToDadosPx),
          dadosToTabelaPx: n(parsed?.print?.dadosToTabelaPx, 0, 120, cur.print.dadosToTabelaPx),
          includeEmpresaHeader: parsed?.print?.includeEmpresaHeader !== false,
        },
      }));
      setSomenteItens(Boolean(parsed?.somenteItens));
    } catch {}
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(`planilha_adequacao_ui_v2`, JSON.stringify({ ...uiPrefs, somenteItens }));
    } catch {}
  }, [uiPrefs, somenteItens]);

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

  async function carregarVersoes() {
    if (!idObra) return;
    try {
      setErr(null);
      const res = await authFetch(`/api/v1/engenharia/obras/${idObra}/planilha?view=versoes-min`);
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.message || "Erro ao carregar versões");

      const obra = json.data?.obra || null;
      setObraNome(String(obra?.nome || "").trim());

      const list = Array.isArray(json.data?.versoes) ? (json.data.versoes as any[]) : [];
      const normalized: VersaoRow[] = list
        .map((v) => ({
          idPlanilha: Number(v.idPlanilha),
          numeroVersao: Number(v.numeroVersao),
          nome: String(v.nome || ""),
          atual: Boolean(v.atual),
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

  const selectedTarget = useMemo(() => {
    const id = Number(String(targetPlanilhaId || "").trim() || 0);
    if (!id) return null;
    return versoes.find((v) => Number(v.idPlanilha) === id) || null;
  }, [targetPlanilhaId, versoes]);

  const breadcrumb = useMemo(() => {
    const obra = obraNome ? `Obra ${obraNome}` : "Obra selecionada";
    return `Engenharia → Obras → ${obra} → Planilha orçamentária → Adequação entre versões`;
  }, [obraNome]);

  const visibleRows = useMemo(() => {
    if (!rows.length) return [];
    if (!somenteItens) return rows;
    return rows.filter((r) => r.tipoLinha !== "SERVICO");
  }, [rows, somenteItens]);

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
    void Promise.all([carregarVersoes(), carregarEmpresaDocumentosLayout()]).finally(() => {
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
    const headerFontWeight = pp.headerFontWeight === "bold" ? 700 : pp.headerFontWeight === "normal" ? 400 : 600;
    const topToHeaderPx = Math.max(0, Number(pp.topToHeaderPx || 0));
    const headerToDadosPx = Math.max(0, Number(pp.headerToDadosPx || 0));
    const dadosToTabelaPx = Math.max(0, Number(pp.dadosToTabelaPx || 0));

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

    const src = versoes.find((v) => Number(v.idPlanilha) === Number(String(sourcePlanilhaId || "").trim() || 0)) || null;
    const dst = selectedTarget;
    const dataHoje = new Date().toLocaleDateString("pt-BR");

    const dadosHtml = `
      <div class="dados" style="margin-top:${headerToDadosPx}px;">
        <div class="dados-title">PLANILHA DE ADEQUAÇÃO DE SERVIÇOS</div>
        <div class="dados-row">
          <span class="lab">Obra:</span><span class="val">${escapeHtml(obraNome ? obraNome : `#${idObra}`)}</span>
          <span class="sep">•</span>
          <span class="lab">Data:</span><span class="val">${escapeHtml(dataHoje)}</span>
        </div>
        <div class="dados-row">
          <span class="lab">Origem (Contratado):</span><span class="val">${src ? `#${src.idPlanilha} - v${src.numeroVersao} ${src.nome || ""}` : "-"}</span>
        </div>
        <div class="dados-row">
          <span class="lab">Destino (Adequado):</span><span class="val">${dst ? `#${dst.idPlanilha} - v${dst.numeroVersao} ${dst.nome || ""}` : "-"}</span>
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
        const n2 = (v: number) => escapeHtml(fmtNumber(v, 2));
        const money = (v: number) => escapeHtml(fmtMoney(v));
        return `<tr style="${style}">
          <td>${show(r.item)}</td>
          <td>${show(r.servicos)}</td>
          <td>${show(r.und)}</td>
          <td style="text-align:right">${isHeader ? "—" : n2(r.contratadoQuant)}</td>
          <td style="text-align:right">${isHeader ? "—" : n2(r.contratadoPreco)}</td>
          <td style="text-align:right">${isHeader ? "—" : money(r.contratadoTotal)}</td>
          <td style="text-align:right">${isHeader ? "—" : n2(r.qAditado)}</td>
          <td style="text-align:right">${isHeader ? "—" : n2(r.qSuprimido)}</td>
          <td style="text-align:right">${isHeader ? "—" : n2(r.qAdequado)}</td>
          <td style="text-align:right">${isHeader ? "—" : money(r.vAditado)}</td>
          <td style="text-align:right">${isHeader ? "—" : money(r.vSuprimido)}</td>
          <td style="text-align:right">${isHeader ? "—" : money(r.vAdequado)}</td>
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
      @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
      .print-header { position: fixed; top: ${topToHeaderPx}px; left: 0; right: 0; background: #ffffff; padding: 6px 10px; font-family: ${escapeHtml(pp.headerFontFamily)}; font-size: ${Number(pp.headerFontSizePx || 11)}px; z-index: 20; }
      .print-header, .print-header * { line-height: 1.12; }
      .print-content { padding: 6px 10px; position: relative; z-index: 1; }
      .dados { width: 100%; }
      .dados-title { font-weight: 700; text-align: center; margin: 6px 0 10px 0; }
      .dados-row { display: flex; flex-wrap: wrap; gap: 6px; font-size: ${Math.max(10, Math.min(16, Number(pp.headerFontSizePx || 11)))}px; }
      .lab { font-weight: ${headerFontWeight}; }
      .val { font-weight: 700; }
      .sep { opacity: 0.6; }
      .empresa-cabecalho { width: 100%; }
      .empresa-rodape { width: 100%; margin-top: 14px; }
      table { width: 100%; border-collapse: collapse; margin-top: ${dadosToTabelaPx}px; }
      th, td { border: 1px solid #cbd5e1; padding: 4px 6px; vertical-align: top; }
      thead th { background: #f8fafc; }
      .t-center { text-align: center; }
      .t-right { text-align: right; }
    </style>
  </head>
  <body>
    <div class="print-header">
      ${cabecalhoEmpresaHtml}
    </div>
    <div class="print-content">
      <div style="height:${Math.max(0, topToHeaderPx)}px"></div>
      ${dadosHtml}
      <table>
        ${colgroupHtml}
        <thead>
          <tr>
            <th rowspan="2">ITEM</th>
            <th rowspan="2">SERVIÇOS</th>
            <th rowspan="2">UND</th>
            <th class="t-center" colspan="3">CONTRATADO</th>
            <th class="t-center" colspan="3">QUANTIDADES</th>
            <th class="t-center" colspan="3">VALORES</th>
          </tr>
          <tr>
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
    <script>window.focus(); window.print();</script>
  </body>
</html>`);
    w.document.close();
  }

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-7xl text-slate-900">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="text-xs text-slate-500">{breadcrumb}</div>
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
            <div className="text-sm text-slate-600">Origem (Contratado)</div>
            <select
              className="input bg-white w-full"
              value={sourcePlanilhaId}
              onChange={(e) => setSourcePlanilhaId(e.target.value)}
              disabled={loading}
              title="Versão base (antes): usada como referência do Contratado"
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
            <div className="text-sm font-semibold text-slate-800">Destino (Adequado)</div>
            <select
              className="input bg-white w-full text-base font-semibold"
              value={targetPlanilhaId}
              onChange={(e) => setTargetPlanilhaId(e.target.value)}
              disabled={loading || Boolean(String(planilhaIdFromQs || "").trim())}
              title={
                Boolean(String(planilhaIdFromQs || "").trim())
                  ? "Destino fixado na planilha selecionada (aberto a partir da Planilha)"
                  : "Versão final (depois): usada como referência do Adequado"
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
                      onChange={(e) =>
                        setUiPrefs((p) => ({ ...p, print: { ...p.print, headerFontSizePx: Math.max(8, Math.min(16, Number(e.target.value || 11))) } }))
                      }
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
                      onChange={(e) =>
                        setUiPrefs((p) => ({ ...p, print: { ...p.print, topToHeaderPx: Math.max(0, Math.min(80, Number(e.target.value || 0))) } }))
                      }
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
                      onChange={(e) =>
                        setUiPrefs((p) => ({ ...p, print: { ...p.print, headerToDadosPx: Math.max(0, Math.min(80, Number(e.target.value || 0))) } }))
                      }
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
                      onChange={(e) =>
                        setUiPrefs((p) => ({ ...p, print: { ...p.print, dadosToTabelaPx: Math.max(0, Math.min(120, Number(e.target.value || 0))) } }))
                      }
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
        </div>
      ) : null}

      <section className="rounded-xl border bg-white p-4 shadow-sm space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <div className="text-lg font-semibold">PLANILHA DE ADEQUAÇÃO DE SERVIÇOS</div>
            {selectedTarget ? <div className="text-sm text-slate-600">{`Destino: #${selectedTarget.idPlanilha} - ${selectedTarget.nome || "—"}`}</div> : null}
          </div>
          <div className="text-sm text-slate-600">
            Linhas: <span className="font-semibold text-slate-900">{rows.length}</span>
          </div>
        </div>

        <div className="overflow-auto rounded-lg border" style={{ fontSize: `${uiPrefs.fontSizePx}px` }}>
          <table className="min-w-[1200px] w-full border-collapse">
            <colgroup>
              <col style={{ width: `${uiPrefs.wItemPx}px` }} />
              <col style={{ width: `${uiPrefs.wServicosPx}px` }} />
              <col style={{ width: `${uiPrefs.wUndPx}px` }} />
              {Array.from({ length: 9 }).map((_, i) => (
                <col key={i} style={{ width: `${uiPrefs.wNumPx}px` }} />
              ))}
            </colgroup>
            <thead className="bg-slate-50 text-left text-slate-700">
              <tr className="border-b">
                <th className="px-3 py-2 border border-slate-300" colSpan={12}>
                  <div className="text-center font-semibold">PLANILHA DE ADEQUAÇÃO DE SERVIÇOS</div>
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
                    <td className="px-3 py-2 text-right border border-slate-300">{fmtNumber(r.contratadoQuant, 2)}</td>
                    <td className="px-3 py-2 text-right border border-slate-300">{fmtNumber(r.contratadoPreco, 2)}</td>
                    <td className="px-3 py-2 text-right border border-slate-300">{fmtMoney(r.contratadoTotal)}</td>
                    <td className="px-3 py-2 text-right border border-slate-300">{fmtNumber(r.qAditado, 2)}</td>
                    <td className="px-3 py-2 text-right border border-slate-300">{fmtNumber(r.qSuprimido, 2)}</td>
                    <td className="px-3 py-2 text-right border border-slate-300">{fmtNumber(r.qAdequado, 2)}</td>
                    <td className="px-3 py-2 text-right border border-slate-300">{fmtMoney(r.vAditado)}</td>
                    <td className="px-3 py-2 text-right border border-slate-300">{fmtMoney(r.vSuprimido)}</td>
                    <td className="px-3 py-2 text-right border border-slate-300">{fmtMoney(r.vAdequado)}</td>
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
