"use client";

import { useEffect, useMemo, useState } from "react";
import { PresencasApi } from "@/lib/modules/presencas/api";
import type { ProdutividadeLinhaDTO } from "@/lib/modules/presencas/types";

export default function ProdutividadeClient() {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [idObra, setIdObra] = useState("");
  const [competencia, setCompetencia] = useState(() => new Date().toISOString().slice(0, 7));
  const [linhas, setLinhas] = useState<ProdutividadeLinhaDTO[]>([]);

  const total = useMemo(() => {
    const qtd = linhas.reduce((acc, l) => acc + (l.quantidade || 0), 0);
    const horas = linhas.reduce((acc, l) => acc + (l.horas || 0), 0);
    const prod = horas > 0 ? qtd / horas : null;
    return { qtd, horas, prod };
  }, [linhas]);

  async function carregar() {
    const obra = Number(idObra || 0);
    if (!obra) return;
    try {
      setLoading(true);
      setErr(null);
      const rows = await PresencasApi.produtividadeObra({ idObra: obra, competencia });
      setLinhas(Array.isArray(rows) ? rows : []);
    } catch (e: any) {
      setErr(String(e?.message || "Erro ao carregar produtividade"));
      setLinhas([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setLinhas([]);
  }, [idObra, competencia]);

  return (
    <div className="p-6 space-y-6 max-w-7xl">
      <div>
        <h1 className="text-2xl font-semibold">Produtividade por obra</h1>
        <p className="text-sm text-slate-600">Tabela por funcionário, com base em presenças e produção diária.</p>
      </div>

      <div className="rounded-xl border bg-white p-4 shadow-sm">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <div>
            <div className="text-sm text-slate-600">ID Obra</div>
            <input className="input" value={idObra} onChange={(e) => setIdObra(e.target.value)} placeholder="Ex.: 12" />
          </div>
          <div>
            <div className="text-sm text-slate-600">Competência</div>
            <input className="input" type="month" value={competencia} onChange={(e) => setCompetencia(e.target.value)} />
          </div>
          <div className="flex items-end gap-2 md:col-span-2">
            <button className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white" type="button" onClick={carregar} disabled={loading}>
              {loading ? "Carregando..." : "Carregar"}
            </button>
          </div>
        </div>
        {err ? <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div> : null}
      </div>

      <div className="rounded-xl border bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-sm text-slate-600">
            Total: <span className="font-medium">{total.qtd.toFixed(2)}</span> · Horas: <span className="font-medium">{total.horas.toFixed(2)}</span>{" "}
            {total.prod != null ? (
              <>
                · Produtividade: <span className="font-medium">{total.prod.toFixed(4)}</span>
              </>
            ) : null}
          </div>
        </div>

        <div className="mt-3 overflow-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left">
              <tr>
                <th className="px-3 py-2">Funcionário</th>
                <th className="px-3 py-2">Serviços</th>
                <th className="px-3 py-2">Quantidade</th>
                <th className="px-3 py-2">Unidade</th>
                <th className="px-3 py-2">Horas</th>
                <th className="px-3 py-2">Produtividade</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((l) => (
                <tr key={`${l.idFuncionario}-${(l.servicos || []).join("|")}-${l.unidadeMedida || ""}`} className="border-t">
                  <td className="px-3 py-2">{l.funcionarioNome}</td>
                  <td className="px-3 py-2">{(l.servicos || []).join(", ") || "-"}</td>
                  <td className="px-3 py-2">{Number(l.quantidade || 0).toFixed(2)}</td>
                  <td className="px-3 py-2">{l.unidadeMedida || "-"}</td>
                  <td className="px-3 py-2">{Number(l.horas || 0).toFixed(2)}</td>
                  <td className="px-3 py-2">{l.produtividade == null ? "-" : Number(l.produtividade).toFixed(4)}</td>
                </tr>
              ))}
              {!linhas.length ? (
                <tr>
                  <td className="px-3 py-6 text-center text-slate-500" colSpan={6}>
                    Sem dados para o período.
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

