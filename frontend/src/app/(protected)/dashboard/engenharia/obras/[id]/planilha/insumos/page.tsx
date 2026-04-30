"use client";

import { useEffect, useMemo, useState } from "react";
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

  useEffect(() => {
    carregar();
  }, [idObra]);

  return (
    <div className="p-6 space-y-4 max-w-7xl text-slate-900">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="inline-flex items-center gap-1 rounded-lg border bg-white p-1">
          <button
            className="rounded-md px-2 py-1 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-60"
            type="button"
            onClick={() => router.push(`/dashboard/engenharia/obras/${idObra}/planilha?returnTo=${encodeURIComponent(returnTo || "")}`)}
            disabled={loading}
          >
            Planilha
          </button>
          <button
            className="rounded-md px-2 py-1 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-60"
            type="button"
            onClick={() => router.push(`/dashboard/engenharia/obras/${idObra}/planilha/composicoes?returnTo=${encodeURIComponent(returnTo || "")}`)}
            disabled={loading}
          >
            Composições
          </button>
          <button
            className="rounded-md bg-blue-600 px-2 py-1 text-xs font-medium text-white disabled:opacity-60"
            type="button"
            onClick={() => router.push(`/dashboard/engenharia/obras/${idObra}/planilha/insumos?returnTo=${encodeURIComponent(returnTo || "")}`)}
            disabled={loading}
          >
            Insumos
          </button>
          <button
            className="rounded-md px-2 py-1 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-60"
            type="button"
            onClick={() => router.push(returnTo || `/dashboard/engenharia/obras/${idObra}/planilha`)}
            disabled={loading}
          >
            Voltar
          </button>
        </div>
        <button className="rounded-lg border bg-white px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-60" type="button" onClick={carregar} disabled={loading}>
          Atualizar
        </button>
      </div>

      <div>
        <div className="text-xs text-slate-500">Engenharia → Obras → Obra selecionada → Planilha orçamentária → Insumos</div>
        <h1 className="text-2xl font-semibold">Insumos consolidados — Obra #{idObra}</h1>
        <div className="text-sm text-slate-600">Cálculo baseado na planilha atual e nas composições importadas/cadastradas.</div>
      </div>

      {err ? <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div> : null}

      <section className="rounded-xl border bg-white p-4 shadow-sm space-y-3">
        <div className="overflow-auto">
          <table className="min-w-[900px] w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-700">
              <tr>
                <th className="px-3 py-2">INSUMO</th>
                <th className="px-3 py-2">DESCRIÇÃO</th>
                <th className="px-3 py-2">UND</th>
                <th className="px-3 py-2 text-right">QUANTIDADE TOTAL</th>
                <th className="px-3 py-2">CENTRO DE CUSTO</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.codigoItem} className="border-t">
                  <td className="px-3 py-2">{r.codigoItem}</td>
                  <td className="px-3 py-2">{r.descricao}</td>
                  <td className="px-3 py-2">{r.und}</td>
                  <td className="px-3 py-2 text-right">{Number(r.quantidadeTotal || 0).toLocaleString("pt-BR", { minimumFractionDigits: 4, maximumFractionDigits: 4 })}</td>
                  <td className="px-3 py-2">{r.codigoCentroCusto || ""}</td>
                </tr>
              ))}
              {!rows.length ? (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-slate-500">
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
