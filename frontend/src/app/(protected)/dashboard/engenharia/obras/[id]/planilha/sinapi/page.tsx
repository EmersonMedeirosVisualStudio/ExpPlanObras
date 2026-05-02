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

type ObraListaRow = { idObra: number; nomeObra: string; numeroContrato: string | null };

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
  const [insumosSheetName, setInsumosSheetName] = useState<string>("ISD");
  const [codigoServico, setCodigoServico] = useState<string>(codigoParam);
  const [codigoFiltro, setCodigoFiltro] = useState<string>(codigoParam);
  const [dataBaseFiltro, setDataBaseFiltro] = useState<string>(dataBaseParam);
  const [ufFiltro, setUfFiltro] = useState<string>("");
  const [insumosModoFiltro, setInsumosModoFiltro] = useState<"" | "ISD" | "ICD" | "ISE">("");
  const [targetObraId, setTargetObraId] = useState<number>(Number.isFinite(idObra) && idObra > 0 ? idObra : 0);
  const [obrasLista, setObrasLista] = useState<ObraListaRow[]>([]);
  const [escopo, setEscopo] = useState<"PLANILHA" | "SERVICO" | "ARQUIVO">(codigoParam ? "SERVICO" : "PLANILHA");
  const [mode, setMode] = useState<"MISSING_ONLY" | "UPSERT">("MISSING_ONLY");
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
  const [importadosErr, setImportadosErr] = useState<string>("");
  const [planilhaDataBaseSinapi, setPlanilhaDataBaseSinapi] = useState<string>("");
  const [showFiltros, setShowFiltros] = useState<boolean>(false);
  const [importOpen, setImportOpen] = useState<boolean>(false);

  const breadcrumb = useMemo(() => {
    return "Engenharia → Obras → Obra selecionada → Planilha orçamentária → Sinapi";
  }, []);

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
    if (escopo === "SERVICO" && !codigoServico.trim()) {
      setErr("Informe o código do serviço.");
      return;
    }
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("sheetName", sheetName.trim() || "Analítico");
      if (uf.trim()) fd.append("uf", uf.trim().toUpperCase());
      fd.append("insumosModo", insumosModo);
      if (insumosSheetName.trim()) fd.append("insumosSheetName", insumosSheetName.trim());
      if (Number.isFinite(targetObraId) && targetObraId > 0) fd.append("targetObraId", String(targetObraId));
      if (escopo === "SERVICO" && codigoServico.trim()) fd.append("codigoServico", codigoServico.trim().toUpperCase());
      fd.append("mode", mode);
      fd.append("importAllParsed", String(escopo === "ARQUIVO"));
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
      setPageErr("Obra inválida.");
      return;
    }
    setPageErr("");
    setPageOkMsg("");
    setPreview(null);
    setImported(null);
    setAppliedBase(null);

    if (!row?.codigo?.trim()) {
      setPageErr("Código inválido.");
      return;
    }

    if (mode === "UPSERT") {
      const ok = window.confirm("Você escolheu atualizar/substituir a composição existente na obra. Confirmar?");
      if (!ok) return;
    }

    const planDb = String(planilhaDataBaseSinapi || "").trim();
    const baseDb = String(row.dataBase || "").trim();
    if (planDb && baseDb && planDb !== baseDb && !forceDataBaseMismatch) {
      setPageErr("Mês-base diferente. Marque “Forçar importação (mês-base diferente)” para prosseguir.");
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
          targetObraId: Number.isFinite(targetObraId) && targetObraId > 0 ? targetObraId : undefined,
          mode,
          forceDataBaseMismatch,
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.message || "Falha ao aplicar composição já importada");
      setAppliedBase(json.data as ApplyBaseResult);
      setPageOkMsg("Composição aplicada na obra.");
    } catch (e: any) {
      setPageErr(e?.message || "Erro ao aplicar composição");
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
  }, [idObra, codigoFiltro, dataBaseFiltro, ufFiltro, insumosModoFiltro]);

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
    if (codigoParam) {
      setCodigoServico(codigoParam);
      setCodigoFiltro(codigoParam);
      setEscopo("SERVICO");
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
      if (!norm || norm === "ISD" || norm === "ICD" || norm === "ISE") return insumosModo;
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
    <div className="p-4 md:p-6 space-y-6 max-w-5xl text-slate-900">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex-1 min-w-[260px]">
          <div className="text-xs text-slate-500">{breadcrumb}</div>
          <h1 className="text-2xl font-semibold">Sinapi</h1>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-500 disabled:opacity-60"
            type="button"
            onClick={() => {
              setOkMsg("");
              setErr("");
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
            onClick={() => router.push(backHref)}
            disabled={busy}
            title="Voltar"
          >
            Voltar
          </button>
        </div>
      </div>

      {pageOkMsg ? <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">{pageOkMsg}</div> : null}
      {pageErr ? <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{pageErr}</div> : null}

      <section className="rounded-xl border bg-white p-4 shadow-sm space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="text-lg font-semibold">Serviços SINAPI importados</div>
          <button
            className="rounded-lg border bg-white px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-60"
            type="button"
            onClick={() => setShowFiltros((v) => !v)}
            disabled={busy}
          >
            {showFiltros ? "Ocultar filtros" : "Exibir filtros"}
          </button>
        </div>

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
            <div className="hidden md:grid grid-cols-[110px_1fr_70px_150px_60px_110px_140px_140px] bg-slate-50 text-xs font-semibold text-slate-700">
              <div className="px-2 py-2 border-r">Código</div>
              <div className="px-2 py-2 border-r">Descrição</div>
              <div className="px-2 py-2 border-r text-center">un</div>
              <div className="px-2 py-2 border-r text-right">Valor da composição</div>
              <div className="px-2 py-2 border-r text-center">UF</div>
              <div className="px-2 py-2 border-r text-center">Data-base</div>
              <div className="px-2 py-2 border-r text-center">Preços de insumos</div>
              <div className="px-2 py-2 text-center">Ações</div>
            </div>
            <div className="divide-y">
              {importados.map((r) => (
                <div
                  key={`${r.dataBase}:${r.uf}:${r.insumosModo}:${r.codigo}`}
                  className="grid grid-cols-1 md:grid-cols-[110px_1fr_70px_150px_60px_110px_140px_140px] text-sm"
                >
                  <div className="px-2 py-2 md:border-r text-center">{r.codigo}</div>
                  <div className="px-2 py-2 md:border-r">{r.descricao}</div>
                  <div className="px-2 py-2 md:border-r text-center">{r.und}</div>
                  <div className="px-2 py-2 md:border-r text-right">
                    {r.valorComposicao == null ? "—" : Number(r.valorComposicao).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                  </div>
                  <div className="px-2 py-2 md:border-r text-center">{r.uf || "—"}</div>
                  <div className="px-2 py-2 md:border-r text-center">{r.dataBase || "—"}</div>
                  <div className="px-2 py-2 md:border-r text-center">{r.insumosModo || "—"}</div>
                  <div className="px-2 py-2 flex items-center justify-center gap-2">
                    <button
                      className="rounded border bg-white px-2 py-1 text-xs hover:bg-slate-50 disabled:opacity-60"
                      type="button"
                      disabled={busy}
                      onClick={() => aplicarDaBase({ codigo: r.codigo, dataBase: r.dataBase, uf: r.uf, insumosModo: r.insumosModo })}
                    >
                      Aplicar na obra
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="text-sm text-slate-600">Nenhum serviço SINAPI importado ainda.</div>
        )}
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

      {importOpen ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 overflow-auto">
          <div className="w-full max-w-5xl rounded-xl border bg-white shadow-sm">
            <div className="flex items-center justify-between gap-3 border-b p-4">
              <div className="text-lg font-semibold">Opções de importação</div>
              <button
                className="rounded-lg border bg-white px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-60"
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
            </div>

            <div className="p-4 space-y-4">
              {okMsg ? <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">{okMsg}</div> : null}
              {err ? <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div> : null}
              <div className="rounded-xl border bg-white p-4 shadow-sm space-y-4">
                <div className="grid grid-cols-1 gap-3 md:grid-cols-12">
                  <div className="md:col-span-6 space-y-1">
                    <div className="text-sm text-slate-600">Aba (Relatório Analítico de Composições)</div>
                    <input className="input bg-white" value={sheetName} onChange={(e) => setSheetName(e.target.value)} disabled={busy} placeholder="Analítico" />
                  </div>
                  <div className="md:col-span-3 space-y-1">
                    <div className="text-sm text-slate-600">UF</div>
                    <select className="input bg-white w-[92px]" value={uf} onChange={(e) => setUf(e.target.value)} disabled={busy}>
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
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="text-sm text-slate-600">Arquivo XLSX</div>
                  <div className="flex items-center gap-2 flex-wrap">
                    {file ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <XCircle className="h-4 w-4 text-red-600" />}
                    <div className="text-sm text-slate-700">{file ? String(file.name || "") : "Nenhum arquivo selecionado"}</div>
                    <button
                      className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-500 disabled:opacity-60"
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={busy}
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

                <div className="grid grid-cols-1 gap-3 md:grid-cols-12">
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
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="text-sm text-slate-600">Escopo</div>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={escopo === "SERVICO"}
                      onChange={() => setEscopo((cur) => (cur === "SERVICO" ? "PLANILHA" : "SERVICO"))}
                      disabled={busy}
                    />
                    <span>Selecionar um serviço</span>
                  </label>
                  {escopo === "SERVICO" ? (
                    <div>
                      <div className="text-xs text-slate-500">Código do serviço</div>
                      <input className="input bg-white mt-1" value={codigoServico} onChange={(e) => setCodigoServico(e.target.value)} disabled={busy} placeholder="Ex: 100309" />
                    </div>
                  ) : null}
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={escopo === "ARQUIVO"}
                      onChange={() => setEscopo((cur) => (cur === "ARQUIVO" ? "PLANILHA" : "ARQUIVO"))}
                      disabled={busy}
                    />
                    <span>Importar TODAS as composições encontradas no arquivo</span>
                  </label>
                </div>

                <label className="flex items-center gap-2 text-sm rounded border bg-white px-3 py-2">
                  <input type="checkbox" checked={forceDataBaseMismatch} onChange={(e) => setForceDataBaseMismatch(Boolean(e.target.checked))} disabled={busy} />
                  <span className="text-slate-700">Forçar importação (mês-base diferente)</span>
                </label>

                <div className="flex items-center justify-end gap-2 flex-wrap">
                  <button className="rounded-lg border bg-white px-4 py-2 text-sm hover:bg-slate-50 disabled:opacity-60" type="button" onClick={() => doRequest(true)} disabled={busy}>
                    Prévia
                  </button>
                </div>
              </div>

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
                  <div className="flex items-center justify-end gap-2 flex-wrap">
                    <button
                      className="rounded-lg border bg-white px-4 py-2 text-sm hover:bg-slate-50 disabled:opacity-60"
                      type="button"
                      onClick={() => {
                        setPreview(null);
                        setImported(null);
                        setOkMsg("");
                        setErr("");
                        setImportOpen(false);
                      }}
                      disabled={busy}
                    >
                      Cancelar
                    </button>
                    <button
                      className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-500 disabled:opacity-60"
                      type="button"
                      onClick={importar}
                      disabled={busy}
                    >
                      Importar
                    </button>
                  </div>
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
