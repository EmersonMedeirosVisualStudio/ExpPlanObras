"use client";

import { useMemo, useState } from "react";

type Vinculo = {
  codigoServico: string;
  codigoCentroCusto: string;
  centroCustoDescricao: string | null;
  unidadeMedida: string | null;
  produtividadePrevista: number | null;
  custoUnitarioPrevisto: number | null;
};

export default function ServicosCentrosCustoClient() {
  const [idObra, setIdObra] = useState("");
  const [codigoServico, setCodigoServico] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [rows, setRows] = useState<Vinculo[]>([]);

  const codigoNorm = useMemo(() => codigoServico.trim().toUpperCase(), [codigoServico]);

  async function carregar() {
    if (!codigoNorm) return;
    try {
      setLoading(true);
      setErr(null);
      const res = await fetch(`/api/v1/engenharia/servicos-centros-custo?codigoServico=${encodeURIComponent(codigoNorm)}`, { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.message || "Erro ao carregar vínculos");
      setRows(Array.isArray(json.data) ? json.data : []);
    } catch (e: any) {
      setErr(e?.message || "Erro ao carregar vínculos");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  async function vincularNovo() {
    if (!codigoNorm) return;
    const obra = Number(idObra || 0);
    if (!obra) {
      setErr("Informe o ID da obra (somente o gestor da obra pode vincular por exceção).");
      return;
    }
    const codigoCentroCusto = (prompt("Centro de custo (código, ex.: CC-001):") || "").trim().toUpperCase();
    if (!codigoCentroCusto) return;
    const justificativa = (prompt("Justificativa (obrigatória):") || "").trim();
    if (!justificativa) return;
    try {
      setLoading(true);
      setErr(null);
      const res = await fetch(`/api/v1/engenharia/servicos-centros-custo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idObra: obra, codigoServico: codigoNorm, codigoCentroCusto, justificativa }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.message || "Erro ao vincular");
      await carregar();
    } catch (e: any) {
      setErr(e?.message || "Erro ao vincular");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">Vínculo — Serviço x Centro de custo</h1>
          <div className="text-sm text-slate-600">Controle N:N (mostra apenas centros de custo do serviço e permite vínculo por exceção com justificativa).</div>
        </div>
        <div className="flex gap-2">
          <button className="rounded-lg border px-4 py-2 text-sm" type="button" onClick={carregar} disabled={!codigoNorm || loading}>
            Atualizar
          </button>
          <button className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white" type="button" onClick={vincularNovo} disabled={!codigoNorm || loading}>
            Vincular novo CC
          </button>
        </div>
      </div>

      {err ? <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div> : null}

      <div className="rounded-xl border bg-white p-4 shadow-sm space-y-3">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-6">
          <div>
            <div className="text-sm text-slate-600">Obra (id)</div>
            <input className="input" value={idObra} onChange={(e) => setIdObra(e.target.value)} placeholder="Ex.: 12" />
          </div>
          <div className="md:col-span-3">
            <div className="text-sm text-slate-600">Serviço (código)</div>
            <input className="input" value={codigoServico} onChange={(e) => setCodigoServico(e.target.value)} placeholder="SER-0001" />
          </div>
          <div className="md:col-span-3 flex items-end">
            <div className="text-sm text-slate-500">Dica: se o serviço não tiver CC, a apropriação deve alertar/bloquear conforme configuração.</div>
          </div>
        </div>
      </div>

      <div className="rounded-xl border bg-white p-4 shadow-sm space-y-3">
        <div className="text-lg font-semibold">Centros de custo vinculados</div>
        <div className="overflow-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left">
              <tr>
                <th className="px-3 py-2">Centro de custo</th>
                <th className="px-3 py-2">Descrição</th>
                <th className="px-3 py-2">Un.</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.codigoCentroCusto} className="border-t">
                  <td className="px-3 py-2 font-medium">{r.codigoCentroCusto}</td>
                  <td className="px-3 py-2">{r.centroCustoDescricao || "-"}</td>
                  <td className="px-3 py-2">{r.unidadeMedida || "-"}</td>
                </tr>
              ))}
              {!rows.length ? (
                <tr>
                  <td colSpan={3} className="px-3 py-6 text-center text-slate-500">
                    Nenhum centro de custo vinculado para este serviço.
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
