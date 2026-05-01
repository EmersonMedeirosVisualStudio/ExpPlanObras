"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";

type Row = { codigoItem: string; descricao: string; und: string; quantidadeTotal: number; codigoCentroCusto: string | null };

export default function Page() {
  const router = useRouter();
  const params = useParams();
  const search = useSearchParams();

  const idObra = useMemo(() => Number((params as any)?.id || 0), [params]);
  const returnTo = search.get("returnTo");

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [precosByCodigo, setPrecosByCodigo] = useState<Record<string, number>>({});
  const [precoManual, setPrecoManual] = useState<{ codigoItem: string; valorUnitario: string }>({ codigoItem: "", valorUnitario: "" });
  const fileInputRef = useRef<HTMLInputElement | null>(null);

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

  async function carregar() {
    if (!idObra) return;
    try {
      setLoading(true);
      setErr(null);
      setOkMsg(null);
      const res = await authFetch(`/api/v1/engenharia/obras/${idObra}/planilha/insumos/consolidado`);
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.message || "Erro ao carregar insumos consolidados");
      const list = Array.isArray(json.data?.rows) ? json.data.rows : [];
      setRows(
        list.map((r: any) => ({
          codigoItem: String(r.codigoItem || ""),
          descricao: String(r.descricao || ""),
          und: String(r.und || ""),
          quantidadeTotal: Number(r.quantidadeTotal || 0),
          codigoCentroCusto: r.codigoCentroCusto == null ? null : String(r.codigoCentroCusto),
        }))
      );
    } catch (e: any) {
      setErr(e?.message || "Erro ao carregar insumos consolidados");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  function moeda(v: number) {
    return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  }

  function parseNumberLoose(v: string) {
    const s = String(v || "").trim();
    if (!s) return null;
    const norm = s.replace(/\./g, "").replace(",", ".").replace(/[^\d.\-]/g, "");
    if (!norm) return null;
    const n = Number(norm);
    return Number.isFinite(n) ? n : null;
  }

  async function carregarPrecos() {
    if (!idObra) return;
    try {
      const res = await authFetch(`/api/v1/engenharia/obras/${idObra}/planilha/insumos/precos`);
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.message || "Erro ao carregar preços de insumos");
      const list = Array.isArray(json.data?.rows) ? json.data.rows : [];
      const map: Record<string, number> = {};
      for (const r of list) {
        const code = String(r.codigoItem || "").trim().toUpperCase();
        const val = r.valorUnitario == null ? NaN : Number(r.valorUnitario);
        if (code && Number.isFinite(val) && val >= 0) map[code] = val;
      }
      setPrecosByCodigo(map);
    } catch {
      setPrecosByCodigo({});
    }
  }

  async function salvarPrecoManual() {
    try {
      setLoading(true);
      setErr(null);
      setOkMsg(null);
      const codigoItem = String(precoManual.codigoItem || "").trim().toUpperCase();
      const valorUnitario = parseNumberLoose(precoManual.valorUnitario);
      if (!codigoItem) {
        setErr('Informe o "Cód" do insumo.');
        return;
      }
      if (valorUnitario == null || valorUnitario < 0) {
        setErr('Informe um "Valor unit" válido.');
        return;
      }
      const res = await authFetch(`/api/v1/engenharia/obras/${idObra}/planilha/insumos/precos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ codigoItem, valorUnitario }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.message || "Erro ao salvar preço");
      setOkMsg("Preço salvo com sucesso.");
      setPrecoManual({ codigoItem: "", valorUnitario: "" });
      await carregarPrecos();
    } catch (e: any) {
      setErr(e?.message || "Erro ao salvar preço");
    } finally {
      setLoading(false);
    }
  }

  async function importarPrecosCsv(file: File) {
    try {
      setLoading(true);
      setErr(null);
      setOkMsg(null);
      const form = new FormData();
      form.append("file", file);
      const res = await authFetch(`/api/v1/engenharia/obras/${idObra}/planilha/insumos/precos/importar-csv`, { method: "POST", body: form });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.message || "Erro ao importar preços (CSV)");
      setOkMsg(`Preços importados: ${Number(json.data?.imported || 0)}`);
      await carregarPrecos();
    } catch (e: any) {
      setErr(e?.message || "Erro ao importar preços (CSV)");
    } finally {
      setLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  useEffect(() => {
    carregar();
    carregarPrecos();
  }, [idObra]);

  return (
    <div className="p-6 space-y-4 max-w-7xl text-slate-900">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="text-xs text-slate-500">Engenharia → Obras → Obra selecionada → Planilha orçamentária → Insumos</div>
          <h1 className="text-2xl font-semibold">Insumos consolidados — Obra #{idObra}</h1>
          <div className="text-sm text-slate-600">Cálculo baseado na planilha atual e nas composições importadas/cadastradas.</div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            className="rounded-lg border bg-white px-4 py-2 text-sm hover:bg-slate-50 disabled:opacity-60"
            type="button"
            onClick={() => router.push(`/dashboard/engenharia/obras/${idObra}/planilha?returnTo=${encodeURIComponent(returnTo || "")}`)}
            disabled={loading}
          >
            Planilha
          </button>
          <button
            className="rounded-lg border bg-white px-4 py-2 text-sm hover:bg-slate-50 disabled:opacity-60"
            type="button"
            onClick={() => router.push(`/dashboard/engenharia/obras/${idObra}/planilha/composicoes?returnTo=${encodeURIComponent(returnTo || "")}`)}
            disabled={loading}
          >
            Composições
          </button>
          <button
            className="rounded-lg border bg-blue-600 px-4 py-2 text-sm text-white border-blue-600 hover:bg-blue-500 disabled:opacity-60"
            type="button"
            onClick={() => router.push(`/dashboard/engenharia/obras/${idObra}/planilha/insumos?returnTo=${encodeURIComponent(returnTo || "")}`)}
            disabled={loading}
          >
            Insumos
          </button>
          <button
            className="rounded-lg border bg-white px-4 py-2 text-sm hover:bg-slate-50 disabled:opacity-60"
            type="button"
            onClick={() => router.push(returnTo || `/dashboard/engenharia/obras/${idObra}/planilha`)}
            disabled={loading}
          >
            Voltar
          </button>
        </div>
      </div>

      <div className="flex items-center justify-end gap-2 flex-wrap">
        <button
          className="rounded-lg border bg-white px-4 py-2 text-sm hover:bg-slate-50 disabled:opacity-60"
          type="button"
          onClick={() => {
            carregar();
            carregarPrecos();
          }}
          disabled={loading}
        >
          Atualizar
        </button>
      </div>

      {okMsg ? <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">{okMsg}</div> : null}

      {err ? <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div> : null}

      <section className="rounded-xl border bg-white p-4 shadow-sm space-y-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <div className="text-lg font-semibold">Preço dos insumos</div>
            <div className="text-sm text-slate-600">Cadastro manual e importação por CSV (cód + valor unitário).</div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <input
              className="input bg-white"
              placeholder="Cód"
              value={precoManual.codigoItem}
              onChange={(e) => setPrecoManual((p) => ({ ...p, codigoItem: e.target.value }))}
              disabled={loading}
            />
            <input
              className="input bg-white"
              placeholder="Valor unit"
              value={precoManual.valorUnitario}
              onChange={(e) => setPrecoManual((p) => ({ ...p, valorUnitario: e.target.value }))}
              disabled={loading}
            />
            <button className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-500 disabled:opacity-60" type="button" onClick={salvarPrecoManual} disabled={loading}>
              Salvar
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => {
                const f = (e.target.files || [])[0] || null;
                if (f) importarPrecosCsv(f);
              }}
            />
            <button className="rounded-lg border bg-white px-4 py-2 text-sm hover:bg-slate-50 disabled:opacity-60" type="button" onClick={() => fileInputRef.current?.click()} disabled={loading}>
              Importar CSV (preços)
            </button>
          </div>
        </div>
      </section>

      <section className="rounded-xl border bg-white p-4 shadow-sm space-y-3">
        <div className="overflow-auto">
          <table className="min-w-[1100px] w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-700">
              <tr>
                <th className="px-3 py-2">INSUMO</th>
                <th className="px-3 py-2">DESCRIÇÃO</th>
                <th className="px-3 py-2">UND</th>
                <th className="px-3 py-2 text-right">QUANTIDADE TOTAL</th>
                <th className="px-3 py-2 text-right">VALOR UNIT</th>
                <th className="px-3 py-2 text-right">TOTAL (QTD × VALOR)</th>
                <th className="px-3 py-2">CENTRO DE CUSTO</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const code = String(r.codigoItem || "").trim().toUpperCase();
                const valorUnit = precosByCodigo[code];
                const hasValor = valorUnit != null && Number.isFinite(Number(valorUnit)) && Number(valorUnit) >= 0;
                const total = hasValor ? Number(r.quantidadeTotal || 0) * Number(valorUnit) : null;
                return (
                  <tr key={r.codigoItem} className="border-t">
                    <td className="px-3 py-2">{r.codigoItem}</td>
                    <td className="px-3 py-2">{r.descricao}</td>
                    <td className="px-3 py-2">{r.und}</td>
                    <td className="px-3 py-2 text-right">{Number(r.quantidadeTotal || 0).toLocaleString("pt-BR", { minimumFractionDigits: 4, maximumFractionDigits: 4 })}</td>
                    <td className="px-3 py-2 text-right">{hasValor ? moeda(Number(valorUnit)) : ""}</td>
                    <td className="px-3 py-2 text-right">{total == null ? "" : moeda(Number(total))}</td>
                    <td className="px-3 py-2">{r.codigoCentroCusto || ""}</td>
                  </tr>
                );
              })}
              {!rows.length ? (
                <tr>
                  <td colSpan={7} className="px-3 py-6 text-center text-slate-500">
                    Sem dados. Importe/cadastre composições e clique em Atualizar.
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
