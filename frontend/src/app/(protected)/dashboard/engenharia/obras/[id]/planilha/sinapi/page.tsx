"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";

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

export default function SinapiImportPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const sp = useSearchParams();
  const idObra = Number(params?.id);
  const returnTo = sp.get("returnTo") || "";

  const [file, setFile] = useState<File | null>(null);
  const [sheetName, setSheetName] = useState<string>("Analítico");
  const [uf, setUf] = useState<string>("AC");
  const [mode, setMode] = useState<"MISSING_ONLY" | "UPSERT">("MISSING_ONLY");
  const [importAllParsed, setImportAllParsed] = useState<boolean>(false);
  const [busy, setBusy] = useState<boolean>(false);
  const [err, setErr] = useState<string>("");
  const [okMsg, setOkMsg] = useState<string>("");
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [imported, setImported] = useState<ImportResult | null>(null);

  const breadcrumb = useMemo(() => {
    return "Engenharia → Obras → Obra selecionada → Planilha orçamentária → SINAPI";
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
      fd.append("mode", mode);
      fd.append("importAllParsed", String(importAllParsed));
      fd.append("dryRun", String(dryRun));

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
    await doRequest(false);
  }

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-5xl text-slate-900">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex-1 min-w-[260px]">
          <div className="text-xs text-slate-500">{breadcrumb}</div>
          <h1 className="text-2xl font-semibold">SINAPI — Importar composições (Excel)</h1>
          <div className="mt-2 text-sm text-slate-700">
            Selecione o arquivo XLSX do SINAPI e gere uma prévia antes de importar.
          </div>
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

      <section className="rounded-xl border bg-white p-4 shadow-sm space-y-4">
        <div className="text-lg font-semibold">Arquivo</div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-12">
          <div className="md:col-span-12 space-y-1">
            <div className="text-sm text-slate-600">Upload do XLSX</div>
            <input
              type="file"
              accept=".xlsx"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              disabled={busy}
              title="Selecione o arquivo XLSX do SINAPI"
            />
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
                <div className="text-[11px] text-slate-500">Planilha atual</div>
                <div className="text-sm font-semibold">{preview.planilhaId ? `#${preview.planilhaId}` : "—"}</div>
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
