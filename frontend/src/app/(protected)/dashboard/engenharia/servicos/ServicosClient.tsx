"use client";

import { useEffect, useMemo, useState } from "react";

type Servico = { codigo: string; descricao: string; unidade: string; grupo: string | null; precoUnitario: number };

export default function ServicosClient() {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<Servico[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [novo, setNovo] = useState({ codigo: "", descricao: "", unidade: "", grupo: "", precoUnitario: "" });

  const queryString = useMemo(() => {
    const sp = new URLSearchParams();
    if (q.trim()) sp.set("q", q.trim());
    const s = sp.toString();
    return s ? `?${s}` : "";
  }, [q]);

  async function carregar() {
    try {
      setLoading(true);
      setErr(null);
      const res = await fetch(`/api/v1/engenharia/servicos${queryString}`, { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.message || "Erro ao carregar serviços");
      setRows(Array.isArray(json.data) ? json.data : []);
    } catch (e: any) {
      setErr(e?.message || "Erro ao carregar serviços");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  async function salvar() {
    try {
      setErr(null);
      const payload: any = {
        codigo: novo.codigo.trim().toUpperCase(),
        descricao: novo.descricao.trim(),
        unidade: novo.unidade.trim(),
        grupo: novo.grupo.trim() || null,
        precoUnitario: novo.precoUnitario ? Number(String(novo.precoUnitario).replace(",", ".")) : 0,
      };
      const res = await fetch(`/api/v1/engenharia/servicos`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.message || "Erro ao salvar serviço");
      setNovo({ codigo: "", descricao: "", unidade: "", grupo: "", precoUnitario: "" });
      await carregar();
    } catch (e: any) {
      setErr(e?.message || "Erro ao salvar serviço");
    }
  }

  useEffect(() => {
    carregar();
  }, []);

  return (
    <div className="p-6 space-y-6 max-w-6xl">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">Serviços (base corporativa)</h1>
          <div className="text-sm text-slate-600">Cadastro corporativo de serviços (SINAPI/código interno). Obras consomem estes serviços via planilha.</div>
        </div>
        <button className="rounded-lg border px-4 py-2 text-sm" type="button" onClick={carregar} disabled={loading}>
          {loading ? "Carregando..." : "Atualizar"}
        </button>
      </div>

      {err ? <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div> : null}

      <div className="rounded-xl border bg-white p-4 shadow-sm space-y-3">
        <div className="text-lg font-semibold">Novo serviço</div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-6">
          <div>
            <div className="text-sm text-slate-600">Código</div>
            <input className="input" value={novo.codigo} onChange={(e) => setNovo((p) => ({ ...p, codigo: e.target.value }))} placeholder="SER-0001" />
          </div>
          <div className="md:col-span-3">
            <div className="text-sm text-slate-600">Descrição</div>
            <input className="input" value={novo.descricao} onChange={(e) => setNovo((p) => ({ ...p, descricao: e.target.value }))} />
          </div>
          <div>
            <div className="text-sm text-slate-600">Unidade</div>
            <input className="input" value={novo.unidade} onChange={(e) => setNovo((p) => ({ ...p, unidade: e.target.value }))} placeholder="m²" />
          </div>
          <div>
            <div className="text-sm text-slate-600">Grupo</div>
            <input className="input" value={novo.grupo} onChange={(e) => setNovo((p) => ({ ...p, grupo: e.target.value }))} placeholder="Estrutura" />
          </div>
          <div>
            <div className="text-sm text-slate-600">Preço base</div>
            <input className="input" value={novo.precoUnitario} onChange={(e) => setNovo((p) => ({ ...p, precoUnitario: e.target.value }))} />
          </div>
          <div className="flex items-end justify-end">
            <button className="rounded-lg bg-green-600 px-4 py-2 text-sm text-white" type="button" onClick={salvar}>
              Salvar
            </button>
          </div>
        </div>
      </div>

      <div className="rounded-xl border bg-white p-4 shadow-sm space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="text-lg font-semibold">Lista</div>
          <div className="w-full md:w-96">
            <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por código ou descrição" />
          </div>
        </div>
        <div className="overflow-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left">
              <tr>
                <th className="px-3 py-2">Código</th>
                <th className="px-3 py-2">Descrição</th>
                <th className="px-3 py-2">Un.</th>
                <th className="px-3 py-2">Grupo</th>
                <th className="px-3 py-2">Preço</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.codigo} className="border-t">
                  <td className="px-3 py-2 font-medium">{r.codigo}</td>
                  <td className="px-3 py-2">{r.descricao}</td>
                  <td className="px-3 py-2">{r.unidade}</td>
                  <td className="px-3 py-2">{r.grupo || "-"}</td>
                  <td className="px-3 py-2">{Number(r.precoUnitario || 0).toFixed(2)}</td>
                </tr>
              ))}
              {!rows.length ? (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-slate-500">
                    Sem dados.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

