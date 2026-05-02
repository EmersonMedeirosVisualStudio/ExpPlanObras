"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { CheckCircle2, XCircle } from "lucide-react";

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
    itens: Array<{
      tipoItem: string;
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

export default function SinapiImportPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const sp = useSearchParams();
  const idObra = Number(params?.id);
  const returnTo = sp.get("returnTo") || "";
  const codigoParam = String(sp.get("codigo") || "").trim().toUpperCase();
  const dataBaseParam = String(sp.get("dataBase") || "").trim();

  const [file, setFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [sheetName, setSheetName] = useState<string>("Analítico");
  const [uf, setUf] = useState<string>("AC");
  const [insumosModo, setInsumosModo] = useState<"ISD" | "ICD" | "ISE">("ISD");
  const [codigoServico, setCodigoServico] = useState<string>(codigoParam);
  const [dataBaseFiltro, setDataBaseFiltro] = useState<string>(dataBaseParam);
  const [mode, setMode] = useState<"MISSING_ONLY" | "UPSERT">("MISSING_ONLY");
  const [importAllParsed, setImportAllParsed] = useState<boolean>(false);
  const [forceDataBaseMismatch, setForceDataBaseMismatch] = useState<boolean>(false);
  const [busy, setBusy] = useState<boolean>(false);
  const [err, setErr] = useState<string>("");
  const [okMsg, setOkMsg] = useState<string>("");
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [imported, setImported] = useState<ImportResult | null>(null);
  const [appliedBase, setAppliedBase] = useState<ApplyBaseResult | null>(null);
  const [importados, setImportados] = useState<Array<{ codigo: string; descricao: string; und: string; dataBase: string; uf: string; insumosModo: string; itens: number; insumos: number }>>([]);
  const [importadosErr, setImportadosErr] = useState<string>("");
  const [planilhaDataBaseSinapi, setPlanilhaDataBaseSinapi] = useState<string>("");

  const breadcrumb = useMemo(() => {
    return "Engenharia → Obras → Obra selecionada → Planilha orçamentária → Sinapi";
  }, []);

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

  async function doRequest(dryRun: boolean) {
    if (!Number.isFinite(idObra) || idObra <= 0) {
      setErr("Obra inválida.");
      return;
    }
    setErr("");
    setOkMsg("");
    setImported(null);
    setAppliedBase(null);
    if (!file) {
      setErr("Selecione o arquivo XLSX do SINAPI para importar.");
      return;
    }
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("sheetName", sheetName.trim() || "Analítico");
      if (uf.trim()) fd.append("uf", uf.trim().toUpperCase());
      fd.append("insumosModo", insumosModo);
      if (codigoServico.trim()) fd.append("codigoServico", codigoServico.trim().toUpperCase());
      fd.append("mode", mode);
      fd.append("importAllParsed", String(importAllParsed));
      fd.append("dryRun", String(dryRun));
      fd.append("forceDataBaseMismatch", String(forceDataBaseMismatch));

      const res = await authFetch(`/api/v1/engenharia/obras/${idObra}/planilha/sinapi/import-analitico`, {
        method: "POST",
        body: fd,
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.message || "Falha ao processar importação SINAPI");

      if (dryRun) {
        setPreview(json.data as PreviewResult);
        setOkMsg("Prévia gerada.");
      } else {
        setImported(json.data as ImportResult);
        setOkMsg("Importação concluída.");
      }
    } catch (e: any) {
      setErr(e?.message || "Erro ao importar SINAPI");
    } finally {
      setBusy(false);
    }
  }

  async function importar() {
    if (mode === "UPSERT") {
      const ok = window.confirm("Você escolheu atualizar/substituir composições existentes. Confirmar?");
      if (!ok) return;
    }
    if (preview && preview.paramsMatch !== true && !forceDataBaseMismatch) {
      setErr("Mês-base diferente (ou não detectado). Marque “Forçar importação (mês-base diferente)” para prosseguir.");
      return;
    }
    await doRequest(false);
  }

  async function aplicarDaBase(row: { codigo: string; dataBase: string; uf: string; insumosModo: string }) {
    if (!Number.isFinite(idObra) || idObra <= 0) {
      setErr("Obra inválida.");
      return;
    }
    setErr("");
    setOkMsg("");
    setPreview(null);
    setImported(null);
    setAppliedBase(null);

    if (!row?.codigo?.trim()) {
      setErr("Código inválido.");
      return;
    }

    if (mode === "UPSERT") {
      const ok = window.confirm("Você escolheu atualizar/substituir a composição existente na obra. Confirmar?");
      if (!ok) return;
    }

    const planDb = String(planilhaDataBaseSinapi || "").trim();
    const baseDb = String(row.dataBase || "").trim();
    if (planDb && baseDb && planDb !== baseDb && !forceDataBaseMismatch) {
      setErr("Mês-base diferente. Marque “Forçar importação (mês-base diferente)” para prosseguir.");
      return;
    }

    setBusy(true);
    try {
      const res = await authFetch(`/api/v1/engenharia/obras/${idObra}/planilha/sinapi/aplicar-base`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          codigoServico: String(row.codigo || "").trim().toUpperCase(),
          dataBase: String(row.dataBase || "").trim(),
          uf: String(row.uf || "").trim().toUpperCase(),
          insumosModo: String(row.insumosModo || "").trim().toUpperCase(),
          mode,
          forceDataBaseMismatch,
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.message || "Falha ao aplicar composição já importada");
      setAppliedBase(json.data as ApplyBaseResult);
      setOkMsg("Composição aplicada na obra.");
    } catch (e: any) {
      setErr(e?.message || "Erro ao aplicar composição");
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
        if (codigoServico.trim()) qs.set("codigo", codigoServico.trim().toUpperCase());
        if (dataBaseFiltro.trim()) qs.set("dataBase", dataBaseFiltro.trim());
        if (uf.trim()) qs.set("uf", uf.trim().toUpperCase());
        if (insumosModo.trim()) qs.set("insumosModo", insumosModo.trim());
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
              dataBase: String(r.dataBase || ""),
              uf: String(r.uf || ""),
              insumosModo: String(r.insumosModo || ""),
              itens: r.itens == null ? 0 : Number(r.itens),
              insumos: r.insumos == null ? 0 : Number(r.insumos),
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
  }, [idObra, codigoServico, dataBaseFiltro, uf, insumosModo]);

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
        const planilhaId = atual?.idPlanilha != null ? Number(atual.idPlanilha) : 0;
        if (!planilhaId) {
          setPlanilhaDataBaseSinapi("");
          return;
        }
        const resP = await authFetch(`/api/v1/engenharia/obras/${idObra}/planilha?planilhaId=${planilhaId}`);
        const jsonP = await resP.json().catch(() => null);
        if (!alive) return;
        if (!resP.ok || !jsonP?.success) throw new Error(jsonP?.message || "Erro ao carregar planilha");
        const p = (jsonP.data?.planilha?.parametros || {}) as any;
        setPlanilhaDataBaseSinapi(p?.dataBaseSinapi ? String(p.dataBaseSinapi || "") : "");
      } catch {
        if (!alive) return;
        setPlanilhaDataBaseSinapi("");
      }
    })();
    return () => {
      alive = false;
    };
  }, [idObra]);

  useEffect(() => {
    if (!planilhaDataBaseSinapi.trim()) return;
    if (String(dataBaseParam || "").trim()) return;
    setDataBaseFiltro((cur) => (String(cur || "").trim() ? cur : planilhaDataBaseSinapi.trim()));
  }, [planilhaDataBaseSinapi, dataBaseParam]);

  useEffect(() => {
    if (codigoParam) setCodigoServico(codigoParam);
  }, [codigoParam]);

  useEffect(() => {
    if (dataBaseParam) setDataBaseFiltro(dataBaseParam);
  }, [dataBaseParam]);

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-5xl text-slate-900">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex-1 min-w-[260px]">
          <div className="text-xs text-slate-500">{breadcrumb}</div>
          <h1 className="text-2xl font-semibold">Sinapi</h1>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            className="rounded-lg border bg-white px-4 py-2 text-sm hover:bg-slate-50 disabled:opacity-60"
            type="button"
            onClick={() => router.push(backHref)}
            disabled={busy}
            title="Voltar"
          >
            Voltar
          </button>
        </div>
      </div>

      {okMsg ? <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">{okMsg}</div> : null}
      {err ? <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div> : null}

      <section className="rounded-xl border bg-white p-4 shadow-sm space-y-3">
        <div className="text-lg font-semibold">Serviços SINAPI importados</div>
        {importadosErr ? <div className="rounded border border-red-200 bg-red-50 p-2 text-sm text-red-700">{importadosErr}</div> : null}
        <div className="grid grid-cols-1 gap-3 md:grid-cols-12">
          <div className="md:col-span-3 space-y-1">
            <div className="text-sm text-slate-600">Código</div>
            <input className="input bg-white" value={codigoServico} onChange={(e) => setCodigoServico(e.target.value)} disabled={busy} placeholder="Ex: 100309" />
          </div>
          <div className="md:col-span-3 space-y-1">
            <div className="text-sm text-slate-600">Data-base</div>
            <input className="input bg-white" value={dataBaseFiltro} onChange={(e) => setDataBaseFiltro(e.target.value)} disabled={busy} placeholder={planilhaDataBaseSinapi || "Ex: 04/2025"} />
          </div>
          <div className="md:col-span-2 space-y-1">
            <div className="text-sm text-slate-600">UF</div>
            <input className="input bg-white" value={uf} onChange={(e) => setUf(e.target.value)} disabled={busy} list="ufs" />
          </div>
          <div className="md:col-span-4 space-y-1">
            <div className="text-sm text-slate-600">Preços de insumos</div>
            <select className="input bg-white" value={insumosModo} onChange={(e) => setInsumosModo(e.target.value as any)} disabled={busy}>
              <option value="ISD">ISD — Encargos sociais sem desoneração</option>
              <option value="ICD">ICD — Encargos sociais com desoneração</option>
              <option value="ISE">ISE — Sem encargos sociais</option>
            </select>
          </div>
          <div className="md:col-span-12 text-xs text-slate-600">
            Data-base da planilha (SINAPI): {planilhaDataBaseSinapi || "—"} {dataBaseFiltro.trim() ? `• Filtro: ${dataBaseFiltro.trim()}` : ""}{" "}
            {planilhaDataBaseSinapi && dataBaseFiltro.trim() ? (planilhaDataBaseSinapi.trim() === dataBaseFiltro.trim() ? "• Compatível" : "• Diferente") : ""}
          </div>
        </div>
        {importados.length ? (
          <div className="overflow-auto">
            <table className="min-w-[860px] w-full border-collapse text-xs">
              <thead className="bg-slate-50 text-center text-slate-700">
                <tr>
                  <th className="border px-2 py-1">Código</th>
                  <th className="border px-2 py-1">Descrição</th>
                  <th className="border px-2 py-1">UND</th>
                  <th className="border px-2 py-1">Data-base</th>
                  <th className="border px-2 py-1">UF</th>
                  <th className="border px-2 py-1">Preços</th>
                  <th className="border px-2 py-1">Itens</th>
                  <th className="border px-2 py-1">Insumos</th>
                  <th className="border px-2 py-1">Ações</th>
                </tr>
              </thead>
              <tbody>
                {importados.map((r) => (
                  <tr key={`${r.dataBase}:${r.uf}:${r.insumosModo}:${r.codigo}`} className="border-t">
                    <td className="border px-2 py-1 text-center">{r.codigo}</td>
                    <td className="border px-2 py-1">{r.descricao}</td>
                    <td className="border px-2 py-1 text-center">{r.und}</td>
                    <td className="border px-2 py-1 text-center">{r.dataBase || "—"}</td>
                    <td className="border px-2 py-1 text-center">{r.uf || "—"}</td>
                    <td className="border px-2 py-1 text-center">{r.insumosModo || "—"}</td>
                    <td className="border px-2 py-1 text-right">{Number(r.itens || 0).toLocaleString("pt-BR")}</td>
                    <td className="border px-2 py-1 text-right">{Number(r.insumos || 0).toLocaleString("pt-BR")}</td>
                    <td className="border px-2 py-1 text-center">
                      <button
                        className="rounded border bg-white px-2 py-1 text-xs hover:bg-slate-50 disabled:opacity-60"
                        type="button"
                        disabled={busy}
                        onClick={() => aplicarDaBase(r)}
                        title="Aplicar esta composição já importada diretamente na obra (sem XLSX)"
                      >
                        Aplicar na obra
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-sm text-slate-600">Nenhum serviço SINAPI importado ainda.</div>
        )}
      </section>

      <section className="rounded-xl border bg-white p-4 shadow-sm space-y-4">
        <div className="text-lg font-semibold">Arquivo</div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-12">
          <div className="md:col-span-12 space-y-1">
            <div className="text-sm text-slate-600 flex items-center gap-2">
              <span>Arquivo XLSX</span>
              {file ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <XCircle className="h-4 w-4 text-red-600" />}
              <span className="text-xs text-slate-500">{file ? String(file.name || "") : "Nenhum arquivo selecionado"}</span>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <button
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-500 disabled:opacity-60"
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={busy}
                title="Selecionar arquivo XLSX"
              >
                Selecionar arquivo XLSX
              </button>
              <input
                ref={fileInputRef}
                className="hidden"
                type="file"
                accept=".xlsx"
                onChange={(e) => {
                  const f = e.target.files?.[0] || null;
                  setFile(f);
                  setPreview(null);
                  setImported(null);
                  setOkMsg("");
                  setErr("");
                }}
                disabled={busy}
              />
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-xl border bg-white p-4 shadow-sm space-y-4">
        <div className="text-lg font-semibold">Opções</div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-12">
          <div className="md:col-span-6 space-y-1">
            <div className="text-sm text-slate-600">Aba</div>
            <input className="input bg-white" value={sheetName} onChange={(e) => setSheetName(e.target.value)} disabled={busy} />
          </div>
          <div className="md:col-span-2 space-y-1">
            <div className="text-sm text-slate-600">UF</div>
            <input className="input bg-white" value={uf} onChange={(e) => setUf(e.target.value)} disabled={busy} list="ufs" />
            <datalist id="ufs">
              {[
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
              ].map((x) => (
                <option key={x} value={x} />
              ))}
            </datalist>
          </div>
          <div className="md:col-span-4 space-y-1">
            <div className="text-sm text-slate-600">Preços de insumos</div>
            <select className="input bg-white" value={insumosModo} onChange={(e) => setInsumosModo(e.target.value as any)} disabled={busy} title="Escolha qual aba de preços de insumos usar">
              <option value="ISD">ISD — Encargos sociais sem desoneração</option>
              <option value="ICD">ICD — Encargos sociais com desoneração</option>
              <option value="ISE">ISE — Sem encargos sociais</option>
            </select>
          </div>
          <div className="md:col-span-12 space-y-2">
            <div className="text-sm text-slate-600">Modo</div>
            <label className="flex items-center gap-2 text-sm">
              <input type="radio" name="mode" checked={mode === "MISSING_ONLY"} onChange={() => setMode("MISSING_ONLY")} disabled={busy} />
              <span>Importar somente as composições que faltam na obra</span>
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="radio" name="mode" checked={mode === "UPSERT"} onChange={() => setMode("UPSERT")} disabled={busy} />
              <span>Atualizar/substituir composições existentes na obra</span>
            </label>
          </div>
          <div className="md:col-span-12">
            <label className="flex items-center gap-2 text-sm rounded border bg-white px-3 py-2">
              <input type="checkbox" checked={importAllParsed} onChange={(e) => setImportAllParsed(Boolean(e.target.checked))} disabled={busy} />
              <span className="text-slate-700">Importar todas as composições encontradas no arquivo (não filtrar pelos itens da planilha atual)</span>
            </label>
          </div>
          <div className="md:col-span-12">
            <label className="flex items-center gap-2 text-sm rounded border bg-white px-3 py-2">
              <input type="checkbox" checked={forceDataBaseMismatch} onChange={(e) => setForceDataBaseMismatch(Boolean(e.target.checked))} disabled={busy} />
              <span className="text-slate-700">Forçar importação (mês-base diferente)</span>
            </label>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 flex-wrap">
          <button
            className="rounded-lg border bg-white px-4 py-2 text-sm hover:bg-slate-50 disabled:opacity-60"
            type="button"
            onClick={() => doRequest(true)}
            disabled={busy}
            title="Gerar uma prévia antes de importar"
          >
            Prévia
          </button>
          <button className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-500 disabled:opacity-60" type="button" onClick={importar} disabled={busy} title="Importar no banco">
            Importar
          </button>
        </div>
      </section>

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

      {preview ? (
        <section className="rounded-xl border bg-white p-4 shadow-sm space-y-3">
          <div className="text-lg font-semibold">Prévia</div>
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
                <div className="text-sm font-semibold">
                  {preview.paramsMatch == null ? "—" : preview.paramsMatch ? "Sim" : "Não"}
                </div>
              </div>
              <div className="rounded border bg-white px-3 py-2">
                <div className="text-[11px] text-slate-500">Preços de insumos</div>
                <div className="text-sm font-semibold">{preview.insumosModo ? String(preview.insumosModo) : insumosModo}</div>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-lg border bg-white px-3 py-2">
              <div className="text-[11px] text-slate-500">Composições no arquivo</div>
              <div className="text-sm font-semibold">{preview.parsedComposicoes}</div>
            </div>
            <div className="rounded-lg border bg-white px-3 py-2">
              <div className="text-[11px] text-slate-500">Alvo (planilha atual)</div>
              <div className="text-sm font-semibold">{preview.targetComposicoes}</div>
            </div>
            <div className="rounded-lg border bg-white px-3 py-2">
              <div className="text-[11px] text-slate-500">A importar</div>
              <div className="text-sm font-semibold">{preview.toImportComposicoes}</div>
            </div>
            <div className="rounded-lg border bg-white px-3 py-2">
              <div className="text-[11px] text-slate-500">Itens a importar</div>
              <div className="text-sm font-semibold">{preview.toImportItens}</div>
            </div>
          </div>

          {preview.sample?.length ? (
            <div className="rounded-lg border bg-slate-50 p-3 text-sm">
              <div className="font-semibold text-slate-700">Exemplos</div>
              <div className="mt-2 space-y-2">
                {preview.sample.map((c) => (
                  <div key={c.codigo} className="rounded border bg-white p-2">
                    <div className="text-sm font-semibold">Composição {c.codigo}</div>
                    <div className="mt-2 overflow-auto">
                      <table className="min-w-[700px] w-full border-collapse text-xs">
                        <thead className="bg-slate-100 text-slate-700 text-center">
                          <tr>
                            <th className="border px-2 py-1">Tipo</th>
                            <th className="border px-2 py-1">Código</th>
                            <th className="border px-2 py-1">UND</th>
                            <th className="border px-2 py-1">Qtd</th>
                            <th className="border px-2 py-1">Valor Unit</th>
                            <th className="border px-2 py-1">Descrição</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(c.itens || []).map((it, idx) => (
                            <tr key={idx}>
                              <td className="border px-2 py-1 text-center">{it.tipoItem}</td>
                              <td className="border px-2 py-1 text-center">{it.codigoItem}</td>
                              <td className="border px-2 py-1 text-center">{it.und || ""}</td>
                              <td className="border px-2 py-1 text-right">{Number(it.quantidade || 0).toLocaleString("pt-BR", { minimumFractionDigits: 3, maximumFractionDigits: 3 })}</td>
                              <td className="border px-2 py-1 text-right">
                                {it.valorUnitario == null ? "" : Number(it.valorUnitario).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </td>
                              <td className="border px-2 py-1">{it.descricao || ""}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      {imported ? (
        <section className="rounded-xl border bg-white p-4 shadow-sm space-y-2">
          <div className="text-lg font-semibold">Resultado</div>
          <div className="text-sm text-slate-700">
            Importadas {imported.importedComposicoes} composições e {imported.importedItens} itens.
          </div>
        </section>
      ) : null}
    </div>
  );
}
