"use client";

import { useEffect, useMemo, useState } from "react";

type OrcamentoResumo = {
  idOrcamento: number;
  nome: string;
  tipo: "LICITACAO" | "CONTRATO_PRIVADO";
  dataBaseLabel: string | null;
  referenciaBase: string | null;
  versaoAtual: number | null;
};

export default function OrcamentosClient() {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<OrcamentoResumo[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [novo, setNovo] = useState({ nome: "", tipo: "CONTRATO_PRIVADO" as "LICITACAO" | "CONTRATO_PRIVADO", dataBaseLabel: "SINAPI", referenciaBase: "" });

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
      const res = await fetch(`/api/v1/engenharia/orcamentos${queryString}`, { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.message || "Erro ao carregar orçamentos");
      setRows(Array.isArray(json.data) ? json.data : []);
    } catch (e: any) {
      setErr(e?.message || "Erro ao carregar orçamentos");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  async function criar() {
    try {
      setErr(null);
      const payload: any = {
        nome: novo.nome.trim(),
        tipo: novo.tipo,
        dataBaseLabel: novo.dataBaseLabel.trim() || null,
        referenciaBase: novo.referenciaBase.trim() || null,
      };
      const res = await fetch(`/api/v1/engenharia/orcamentos`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.message || "Erro ao criar orçamento");
      setNovo({ nome: "", tipo: "CONTRATO_PRIVADO", dataBaseLabel: "SINAPI", referenciaBase: "" });
      await carregar();
    } catch (e: any) {
      setErr(e?.message || "Erro ao criar orçamento");
    }
  }

  useEffect(() => {
    carregar();
  }, []);

  return (
    <div className="space-y-6">
      {err ? <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div> : null}

      <div className="rounded-xl border bg-white p-4 shadow-sm space-y-3">
        <div className="text-lg font-semibold">Novo orçamento</div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-6">
          <div className="md:col-span-3">
            <div className="text-sm text-slate-600">Nome / Identificação</div>
            <input className="input" value={novo.nome} onChange={(e) => setNovo((p) => ({ ...p, nome: e.target.value }))} placeholder="Orçamento - Licitação X" />
          </div>
          <div>
            <div className="text-sm text-slate-600">Tipo</div>
            <select className="input" value={novo.tipo} onChange={(e) => setNovo((p) => ({ ...p, tipo: e.target.value as any }))}>
              <option value="LICITACAO">Licitação</option>
              <option value="CONTRATO_PRIVADO">Contrato privado</option>
            </select>
          </div>
          <div>
            <div className="text-sm text-slate-600">Data base</div>
            <input className="input" value={novo.dataBaseLabel} onChange={(e) => setNovo((p) => ({ ...p, dataBaseLabel: e.target.value }))} placeholder="SINAPI" />
          </div>
          <div className="md:col-span-1">
            <div className="text-sm text-slate-600">Referência</div>
            <input className="input" value={novo.referenciaBase} onChange={(e) => setNovo((p) => ({ ...p, referenciaBase: e.target.value }))} placeholder="2026-01 (SP)" />
          </div>
          <div className="flex items-end justify-end md:col-span-6">
            <button className="rounded-lg bg-green-600 px-4 py-2 text-sm text-white" type="button" onClick={criar} disabled={loading}>
              Criar
            </button>
          </div>
        </div>
      </div>

      <div className="rounded-xl border bg-white p-4 shadow-sm space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="text-lg font-semibold">Orçamentos</div>
          <div className="flex gap-2 items-center">
            <input className="input w-80" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nome" />
            <button className="rounded-lg border px-3 py-2 text-sm" type="button" onClick={carregar} disabled={loading}>
              {loading ? "..." : "Atualizar"}
            </button>
          </div>
        </div>

        <div className="overflow-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left">
              <tr>
                <th className="px-3 py-2">ID</th>
                <th className="px-3 py-2">Nome</th>
                <th className="px-3 py-2">Tipo</th>
                <th className="px-3 py-2">Base</th>
                <th className="px-3 py-2">Versão</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.idOrcamento} className="border-t">
                  <td className="px-3 py-2">{r.idOrcamento}</td>
                  <td className="px-3 py-2 font-medium">
                    <a className="underline" href={`/dashboard/engenharia/orcamentos/${r.idOrcamento}`}>
                      {r.nome}
                    </a>
                  </td>
                  <td className="px-3 py-2">{r.tipo}</td>
                  <td className="px-3 py-2">
                    {[r.dataBaseLabel, r.referenciaBase].filter(Boolean).join(" • ") || "-"}
                  </td>
                  <td className="px-3 py-2">{r.versaoAtual ?? "-"}</td>
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
