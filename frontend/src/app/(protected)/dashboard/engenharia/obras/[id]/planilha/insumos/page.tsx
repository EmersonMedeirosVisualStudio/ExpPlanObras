"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";

type Row = { codigoItem: string; descricao: string; und: string; valorUnitario: number; quantidadeTotal: number };

export default function Page() {
  const router = useRouter();
  const params = useParams();
  const search = useSearchParams();

  const idObra = useMemo(() => Number((params as any)?.id || 0), [params]);
  const returnTo = search.get("returnTo");
  const safeReturnTo = useMemo(() => {
    const raw = String(returnTo || "").trim();
    const isExternal = raw.startsWith("//") || /^(?:[a-z][a-z0-9+.-]*:)?\/\//i.test(raw) || /^[a-z][a-z0-9+.-]*:/i.test(raw);
    return raw && !isExternal ? raw : null;
  }, [returnTo]);

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
          valorUnitario: r.valorUnitario == null ? 0 : Number(r.valorUnitario || 0),
          quantidadeTotal: Number(r.quantidadeTotal || 0),
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

  useEffect(() => {
    carregar();
  }, [idObra]);

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-7xl text-slate-900">
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
            onClick={() => router.push(`/dashboard/engenharia/obras/${idObra}/planilha?returnTo=${encodeURIComponent(safeReturnTo || "")}`)}
            disabled={loading}
          >
            Planilha
          </button>
          <button
            className="rounded-lg border bg-white px-4 py-2 text-sm hover:bg-slate-50 disabled:opacity-60"
            type="button"
            onClick={() => router.push(`/dashboard/engenharia/obras/${idObra}/planilha/composicoes?returnTo=${encodeURIComponent(safeReturnTo || "")}`)}
            disabled={loading}
          >
            Composições
          </button>
          <button
            className="rounded-lg border bg-blue-600 px-4 py-2 text-sm text-white border-blue-600 hover:bg-blue-500 disabled:opacity-60"
            type="button"
            onClick={() => router.push(`/dashboard/engenharia/obras/${idObra}/planilha/insumos?returnTo=${encodeURIComponent(safeReturnTo || "")}`)}
            disabled={loading}
          >
            Insumos
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

      <div className="flex items-center justify-end gap-2 flex-wrap">
        <button
          className="rounded-lg border bg-white px-4 py-2 text-sm hover:bg-slate-50 disabled:opacity-60"
          type="button"
          onClick={carregar}
          disabled={loading}
        >
          Atualizar
        </button>
      </div>

      {err ? <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div> : null}

      <section className="rounded-xl border bg-white p-4 shadow-sm space-y-3">
        <div className="overflow-auto">
          <table className="min-w-[1100px] w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-700">
              <tr>
                <th className="px-3 py-2">INSUMO</th>
                <th className="px-3 py-2">DESCRIÇÃO</th>
                <th className="px-3 py-2">UND</th>
                <th className="px-3 py-2 text-right">VALOR UNIT</th>
                <th className="px-3 py-2 text-right">QUANTIDADE TOTAL</th>
                <th className="px-3 py-2 text-right">TOTAL (QTD × VALOR)</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const total = Number(r.quantidadeTotal || 0) * Number(r.valorUnitario || 0);
                return (
                  <tr key={`${r.codigoItem}__${r.und}__${r.valorUnitario}`} className="border-t">
                    <td className="px-3 py-2">{r.codigoItem}</td>
                    <td className="px-3 py-2">{r.descricao}</td>
                    <td className="px-3 py-2">{r.und}</td>
                    <td className="px-3 py-2 text-right">{moeda(Number(r.valorUnitario || 0))}</td>
                    <td className="px-3 py-2 text-right">{Number(r.quantidadeTotal || 0).toLocaleString("pt-BR", { minimumFractionDigits: 4, maximumFractionDigits: 4 })}</td>
                    <td className="px-3 py-2 text-right">{moeda(Number(total || 0))}</td>
                  </tr>
                );
              })}
              {!rows.length ? (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-slate-500">
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
