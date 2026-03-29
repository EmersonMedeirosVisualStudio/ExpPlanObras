"use client";

import { useMemo, useState } from "react";

type Linha = {
  codigoServico: string;
  horasProdutivas: number;
  horasImprodutivas: number;
  custoHoras: number;
  litros: number;
  custoCombustivel: number;
  viagens: number;
  km: number;
  custoKm: number;
  custoTotal: number;
  ativosSemTarifa: number;
};

type Resp = {
  tipoLocal: "OBRA" | "UNIDADE";
  idLocal: number;
  competencia: string;
  linhas: Linha[];
  warnings: string[];
};

export default function CustosAtivosClient() {
  const [tipoLocal, setTipoLocal] = useState<"OBRA" | "UNIDADE">("OBRA");
  const [idLocal, setIdLocal] = useState("");
  const [competencia, setCompetencia] = useState(() => new Date().toISOString().slice(0, 7));
  const [data, setData] = useState<Resp | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const total = useMemo(() => {
    const linhas = data?.linhas || [];
    return linhas.reduce((acc, l) => acc + Number(l.custoTotal || 0), 0);
  }, [data]);

  async function carregar() {
    const id = Number(idLocal || 0);
    if (!id) return;
    try {
      setLoading(true);
      setErr(null);
      const url = `/api/v1/engenharia/ativos/custos/servicos?tipoLocal=${tipoLocal}&idLocal=${id}&competencia=${competencia}`;
      const res = await fetch(url, { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.message || "Erro ao carregar custos");
      setData(json);
    } catch (e: any) {
      setErr(e?.message || "Erro ao carregar custos");
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Custos de Equipamentos por Serviço</h1>
        <p className="text-sm text-slate-600">Consolidação mensal por código do serviço (SER-0001), com base em horas, combustível e viagens.</p>
      </div>

      <div className="rounded-xl border bg-white p-4 shadow-sm">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <div>
            <div className="text-sm text-slate-600">Tipo local</div>
            <select className="input" value={tipoLocal} onChange={(e) => setTipoLocal(e.target.value as any)}>
              <option value="OBRA">Obra</option>
              <option value="UNIDADE">Unidade</option>
            </select>
          </div>
          <div>
            <div className="text-sm text-slate-600">ID Local</div>
            <input className="input" value={idLocal} onChange={(e) => setIdLocal(e.target.value)} placeholder="Ex.: 12" />
          </div>
          <div>
            <div className="text-sm text-slate-600">Competência</div>
            <input className="input" type="month" value={competencia} onChange={(e) => setCompetencia(e.target.value)} />
          </div>
          <div className="flex items-end justify-end">
            <button className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white" type="button" onClick={carregar} disabled={loading}>
              {loading ? "Carregando..." : "Carregar"}
            </button>
          </div>
        </div>
        {err ? <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div> : null}
        {data?.warnings?.length ? (
          <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{data.warnings.join(" ")}</div>
        ) : null}
      </div>

      <div className="rounded-xl border bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-sm text-slate-600">
            Total do período: <span className="font-medium">{total.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</span>
          </div>
        </div>

        <div className="mt-3 overflow-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left">
              <tr>
                <th className="px-3 py-2">Serviço</th>
                <th className="px-3 py-2">Horas (P/I)</th>
                <th className="px-3 py-2">Combustível</th>
                <th className="px-3 py-2">Viagens/Km</th>
                <th className="px-3 py-2">Custo horas</th>
                <th className="px-3 py-2">Custo km</th>
                <th className="px-3 py-2">Custo combustível</th>
                <th className="px-3 py-2">Total</th>
              </tr>
            </thead>
            <tbody>
              {(data?.linhas || []).map((l) => (
                <tr key={l.codigoServico} className="border-t">
                  <td className="px-3 py-2">{l.codigoServico}</td>
                  <td className="px-3 py-2">
                    {Number(l.horasProdutivas || 0).toFixed(2)} / {Number(l.horasImprodutivas || 0).toFixed(2)}
                    {l.ativosSemTarifa ? <span className="ml-2 text-amber-700">({l.ativosSemTarifa} sem tarifa)</span> : null}
                  </td>
                  <td className="px-3 py-2">{Number(l.litros || 0).toFixed(2)} L</td>
                  <td className="px-3 py-2">
                    {Number(l.viagens || 0)} / {Number(l.km || 0).toFixed(2)}
                  </td>
                  <td className="px-3 py-2">{Number(l.custoHoras || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</td>
                  <td className="px-3 py-2">{Number(l.custoKm || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</td>
                  <td className="px-3 py-2">{Number(l.custoCombustivel || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</td>
                  <td className="px-3 py-2 font-medium">{Number(l.custoTotal || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</td>
                </tr>
              ))}
              {!data?.linhas?.length ? (
                <tr>
                  <td className="px-3 py-6 text-center text-slate-500" colSpan={8}>
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

