"use client";

import { useEffect, useMemo, useState } from "react";

type CentroCustoDTO = {
  idCentroCusto: number;
  codigo: string;
  descricao: string;
  tipo: string | null;
  unidadeMedida: string | null;
  ativo: boolean;
  observacao: string | null;
};

export default function CentrosCustoClient() {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<CentroCustoDTO[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [novo, setNovo] = useState({ codigo: "", descricao: "", tipo: "", unidadeMedida: "", ativo: true, observacao: "" });

  const queryString = useMemo(() => {
    const sp = new URLSearchParams();
    if (q.trim()) sp.set("q", q.trim());
    sp.set("ativo", "1");
    const s = sp.toString();
    return s ? `?${s}` : "";
  }, [q]);

  async function carregar() {
    try {
      setLoading(true);
      setErr(null);
      const res = await fetch(`/api/v1/engenharia/centros-custo${queryString}`, { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.message || "Erro ao carregar centros de custo");
      setRows(Array.isArray(json.data) ? json.data : []);
    } catch (e: any) {
      setErr(e?.message || "Erro ao carregar centros de custo");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  async function criar() {
    try {
      setErr(null);
      const payload: any = {
        codigo: novo.codigo.trim().toUpperCase(),
        descricao: novo.descricao.trim(),
        tipo: novo.tipo.trim() || null,
        unidadeMedida: novo.unidadeMedida.trim() || null,
        ativo: novo.ativo,
        observacao: novo.observacao.trim() || null,
      };
      const res = await fetch(`/api/v1/engenharia/centros-custo`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.message || "Erro ao criar centro de custo");
      setNovo({ codigo: "", descricao: "", tipo: "", unidadeMedida: "", ativo: true, observacao: "" });
      await carregar();
    } catch (e: any) {
      setErr(e?.message || "Erro ao criar centro de custo");
    }
  }

  useEffect(() => {
    carregar();
  }, []);

  return (
    <div className="p-6 space-y-6 max-w-6xl">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">Centros de custo</h1>
          <div className="text-sm text-slate-600">Cadastre centros de custo para apropriação obrigatória e vínculos N:N com serviços.</div>
        </div>
        <button className="rounded-lg border px-4 py-2 text-sm" type="button" onClick={carregar} disabled={loading}>
          {loading ? "Carregando..." : "Atualizar"}
        </button>
      </div>

      {err ? <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div> : null}

      <div className="rounded-xl border bg-white p-4 shadow-sm space-y-3">
        <div className="text-lg font-semibold">Novo centro de custo</div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-6">
          <div>
            <div className="text-sm text-slate-600">Código</div>
            <input className="input" value={novo.codigo} onChange={(e) => setNovo((p) => ({ ...p, codigo: e.target.value }))} placeholder="CC-001" />
          </div>
          <div className="md:col-span-2">
            <div className="text-sm text-slate-600">Descrição</div>
            <input className="input" value={novo.descricao} onChange={(e) => setNovo((p) => ({ ...p, descricao: e.target.value }))} />
          </div>
          <div>
            <div className="text-sm text-slate-600">Tipo</div>
            <input className="input" value={novo.tipo} onChange={(e) => setNovo((p) => ({ ...p, tipo: e.target.value }))} placeholder="Ex.: PRODUÇÃO" />
          </div>
          <div>
            <div className="text-sm text-slate-600">Unidade</div>
            <input className="input" value={novo.unidadeMedida} onChange={(e) => setNovo((p) => ({ ...p, unidadeMedida: e.target.value }))} placeholder="m²" />
          </div>
          <div className="flex items-end justify-end">
            <button className="rounded-lg bg-green-600 px-4 py-2 text-sm text-white" type="button" onClick={criar}>
              Criar
            </button>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-6">
          <div className="md:col-span-5">
            <div className="text-sm text-slate-600">Observação</div>
            <input className="input" value={novo.observacao} onChange={(e) => setNovo((p) => ({ ...p, observacao: e.target.value }))} />
          </div>
          <div className="flex items-end">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={novo.ativo} onChange={(e) => setNovo((p) => ({ ...p, ativo: e.target.checked }))} />
              Ativo
            </label>
          </div>
        </div>
      </div>

      <div className="rounded-xl border bg-white p-4 shadow-sm space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="text-lg font-semibold">Lista</div>
          <div className="w-full md:w-80">
            <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por código ou descrição" />
          </div>
        </div>

        <div className="overflow-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left">
              <tr>
                <th className="px-3 py-2">ID</th>
                <th className="px-3 py-2">Código</th>
                <th className="px-3 py-2">Descrição</th>
                <th className="px-3 py-2">Tipo</th>
                <th className="px-3 py-2">Unidade</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.idCentroCusto} className="border-t">
                  <td className="px-3 py-2">{r.idCentroCusto}</td>
                  <td className="px-3 py-2">{r.codigo}</td>
                  <td className="px-3 py-2">{r.descricao}</td>
                  <td className="px-3 py-2">{r.tipo || "-"}</td>
                  <td className="px-3 py-2">{r.unidadeMedida || "-"}</td>
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

