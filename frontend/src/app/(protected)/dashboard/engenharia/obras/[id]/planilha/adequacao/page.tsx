"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { FileSpreadsheet, Printer } from "lucide-react";
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

function fmtNumber(v: number, decimals: number) {
  const n = Number(v || 0);
  return n.toLocaleString("pt-BR", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function fmtMoney(v: number) {
  const n = Number(v || 0);
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
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

  const [ui, setUi] = useState<{ fontSizePx: number }>({ fontSizePx: 12 });

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
      const raw = localStorage.getItem(`planilha_adequacao_ui_v1`);
      if (!raw) return;
      const parsed = JSON.parse(raw) as any;
      const fs = parsed?.fontSizePx != null ? Number(parsed.fontSizePx) : NaN;
      if (Number.isFinite(fs)) setUi({ fontSizePx: Math.max(10, Math.min(18, Math.round(fs))) });
    } catch {}
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(`planilha_adequacao_ui_v1`, JSON.stringify(ui));
    } catch {}
  }, [ui]);

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
    void carregarVersoes().finally(() => {
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
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <span className="text-xs text-slate-500">Fonte</span>
              <select
                className="input bg-white"
                value={String(ui.fontSizePx)}
                onChange={(e) => setUi({ fontSizePx: Number(e.target.value || 12) })}
                disabled={loading}
                title="Tamanho da fonte do grid"
              >
                {[10, 11, 12, 13, 14, 15, 16, 18].map((n) => (
                  <option key={n} value={String(n)}>
                    {n}px
                  </option>
                ))}
              </select>
            </label>
            <button
              className="rounded-lg border bg-white px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-60 inline-flex items-center gap-2"
              type="button"
              onClick={() => window.print()}
              disabled={loading || !rows.length}
              title="Imprimir"
            >
              <Printer className="h-4 w-4" />
              Imprimir
            </button>
            <button
              className="rounded-lg border bg-white px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-60 inline-flex items-center gap-2"
              type="button"
              onClick={exportarCsv}
              disabled={loading || !rows.length}
              title="Exportar CSV"
            >
              <FileSpreadsheet className="h-4 w-4" />
              CSV
            </button>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <label className="space-y-1">
            <div className="text-sm text-slate-600">Origem (Contratado)</div>
            <select className="input bg-white w-full" value={sourcePlanilhaId} onChange={(e) => setSourcePlanilhaId(e.target.value)} disabled={loading}>
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
              title={Boolean(String(planilhaIdFromQs || "").trim()) ? "Destino fixado na planilha selecionada" : "Escolher a versão destino"}
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
            <div className="text-lg font-semibold">PLANILHA DE ADEQUAÇÃO DE SERVIÇOS</div>
            {selectedTarget ? <div className="text-sm text-slate-600">{`Destino: #${selectedTarget.idPlanilha} - ${selectedTarget.nome || "—"}`}</div> : null}
          </div>
          <div className="text-sm text-slate-600">
            Linhas: <span className="font-semibold text-slate-900">{rows.length}</span>
          </div>
        </div>

        <div className="overflow-auto rounded-lg border" style={{ fontSize: `${ui.fontSizePx}px` }}>
          <table className="min-w-[1200px] w-full">
            <thead className="bg-slate-50 text-left text-slate-700">
              <tr className="border-b">
                <th className="px-3 py-2" colSpan={12}>
                  <div className="text-center font-semibold">PLANILHA DE ADEQUAÇÃO DE SERVIÇOS</div>
                </th>
              </tr>
              <tr className="border-b">
                <th className="px-3 py-2 w-[110px]">ITEM</th>
                <th className="px-3 py-2 min-w-[420px]">SERVIÇOS</th>
                <th className="px-3 py-2 w-[70px]">UND</th>
                <th className="px-3 py-2 text-center" colSpan={3}>
                  CONTRATADO
                </th>
                <th className="px-3 py-2 text-center" colSpan={3}>
                  QUANTIDADES
                </th>
                <th className="px-3 py-2 text-center" colSpan={3}>
                  VALORES
                </th>
              </tr>
              <tr className="border-b text-xs">
                <th className="px-3 py-2" />
                <th className="px-3 py-2" />
                <th className="px-3 py-2" />
                <th className="px-3 py-2 text-right">QUANT.</th>
                <th className="px-3 py-2 text-right">PREÇO</th>
                <th className="px-3 py-2 text-right">TOTAL</th>
                <th className="px-3 py-2 text-right">ADITADO</th>
                <th className="px-3 py-2 text-right">SUPRIMIDO</th>
                <th className="px-3 py-2 text-right">ADEQUADO</th>
                <th className="px-3 py-2 text-right">ADITADO</th>
                <th className="px-3 py-2 text-right">SUPRIMIDO</th>
                <th className="px-3 py-2 text-right">ADEQUADO</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, idx) => {
                const isHeader = r.tipoLinha !== "SERVICO";
                return (
                  <tr key={`${r.tipoLinha}-${r.item}-${idx}`} className={`border-t ${isHeader ? "bg-slate-50" : ""}`}>
                    <td className={`px-3 py-2 ${isHeader ? "font-semibold" : ""}`}>{r.item || "—"}</td>
                    <td className={`px-3 py-2 ${isHeader ? "font-semibold" : ""}`}>{r.servicos || "—"}</td>
                    <td className="px-3 py-2">{r.und || "—"}</td>
                    <td className="px-3 py-2 text-right">{isHeader ? "—" : fmtNumber(r.contratadoQuant, 2)}</td>
                    <td className="px-3 py-2 text-right">{isHeader ? "—" : fmtNumber(r.contratadoPreco, 2)}</td>
                    <td className="px-3 py-2 text-right">{isHeader ? "—" : fmtMoney(r.contratadoTotal)}</td>
                    <td className="px-3 py-2 text-right">{isHeader ? "—" : fmtNumber(r.qAditado, 2)}</td>
                    <td className="px-3 py-2 text-right">{isHeader ? "—" : fmtNumber(r.qSuprimido, 2)}</td>
                    <td className="px-3 py-2 text-right">{isHeader ? "—" : fmtNumber(r.qAdequado, 2)}</td>
                    <td className="px-3 py-2 text-right">{isHeader ? "—" : fmtMoney(r.vAditado)}</td>
                    <td className="px-3 py-2 text-right">{isHeader ? "—" : fmtMoney(r.vSuprimido)}</td>
                    <td className="px-3 py-2 text-right">{isHeader ? "—" : fmtMoney(r.vAdequado)}</td>
                  </tr>
                );
              })}
              {!rows.length ? (
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
