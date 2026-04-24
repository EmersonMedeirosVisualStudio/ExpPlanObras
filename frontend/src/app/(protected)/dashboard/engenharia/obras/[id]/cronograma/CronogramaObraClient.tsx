"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Mes = {
  competencia: string;
  planejado: { percentualAcumulado: number | null };
  executadoFisico: { percentualAcumulado: number | null };
  executadoFinanceiro: { percentualAcumulado: number | null };
  valorMedidoMes: number | null;
};

type CronogramaAcomp = {
  idObra: number;
  numeroContrato: string | null;
  valorContratado: number;
  meses: Mes[];
  warnings?: string[];
};

function moeda(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function pct(v: number | null) {
  if (v == null) return "-";
  return `${Math.round(v * 100)}%`;
}

export default function CronogramaObraClient({ idObra }: { idObra: number }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [data, setData] = useState<CronogramaAcomp | null>(null);

  useEffect(() => {
    if (!idObra) return;
    let active = true;
    (async () => {
      try {
        setLoading(true);
        setErr(null);
        const res = await fetch(`/api/v1/dashboard/engenharia/cronograma-acompanhamento?idObra=${idObra}`, { cache: "no-store" });
        const json = await res.json().catch(() => null);
        if (!res.ok || !json?.success) throw new Error(json?.message || "Erro ao carregar cronograma");
        if (!active) return;
        setData(json.data as any);
      } catch (e: any) {
        if (!active) return;
        setData(null);
        setErr(e?.message || "Erro ao carregar cronograma");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [idObra]);

  if (!idObra) {
    return (
      <div className="p-6 max-w-5xl">
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">Obra inválida.</div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-6xl text-slate-900">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">Programação financeira (cronograma) — Obra #{idObra}</h1>
          <div className="text-sm text-slate-600">Leitura de planejado x executado (físico e financeiro) por competência.</div>
        </div>
        <div className="flex gap-2">
          <button className="rounded-lg border bg-white px-4 py-2 text-sm hover:bg-slate-50" type="button" onClick={() => router.push(`/dashboard/engenharia/obras/${idObra}`)}>
            Voltar
          </button>
          <button className="rounded-lg border bg-white px-4 py-2 text-sm hover:bg-slate-50" type="button" onClick={() => router.push(`/dashboard/engenharia/painel`)}>
            Abrir painel
          </button>
        </div>
      </div>

      {err ? <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div> : null}
      {loading ? <div className="text-sm text-slate-600">Carregando...</div> : null}

      {data?.warnings?.length ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{data.warnings.join(" ")}</div>
      ) : null}

      <section className="rounded-xl border bg-white p-4 shadow-sm space-y-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <div className="text-lg font-semibold">Acompanhamento</div>
            <div className="text-sm text-slate-600">Contrato: {data?.numeroContrato?.trim() ? data.numeroContrato : "—"} • Valor contratado: {data ? moeda(Number(data.valorContratado || 0)) : "—"}</div>
          </div>
          <button className="rounded-lg border bg-white px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-60" type="button" onClick={() => location.reload()} disabled={loading}>
            Atualizar
          </button>
        </div>

        <div className="overflow-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-700">
              <tr>
                <th className="px-3 py-2">Mês</th>
                <th className="px-3 py-2">Planejado</th>
                <th className="px-3 py-2">Executado físico</th>
                <th className="px-3 py-2">Executado financeiro</th>
                <th className="px-3 py-2 text-right">Medido mês</th>
              </tr>
            </thead>
            <tbody>
              {(data?.meses || []).map((m) => (
                <tr key={m.competencia} className="border-t">
                  <td className="px-3 py-2">{m.competencia}</td>
                  <td className="px-3 py-2">{pct(m.planejado?.percentualAcumulado ?? null)}</td>
                  <td className="px-3 py-2">{pct(m.executadoFisico?.percentualAcumulado ?? null)}</td>
                  <td className="px-3 py-2">{pct(m.executadoFinanceiro?.percentualAcumulado ?? null)}</td>
                  <td className="px-3 py-2 text-right">{m.valorMedidoMes == null ? "-" : moeda(Number(m.valorMedidoMes || 0))}</td>
                </tr>
              ))}
              {!data?.meses?.length ? (
                <tr>
                  <td className="px-3 py-6 text-center text-slate-500" colSpan={5}>
                    Sem dados de cronograma para a obra.
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

