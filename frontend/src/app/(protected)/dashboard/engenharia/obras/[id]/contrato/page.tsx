"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";

type ContratoDaObra = {
  idObra: number;
  nomeObra: string;
  idContrato: number | null;
  numeroContrato: string;
  statusContrato: string | null;
  valorContratado: number;
  valorExecutado: number;
  valorPago: number;
};

function formatMoneyBRL(v: number) {
  try {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0);
  } catch {
    return String(v || 0);
  }
}

export default function ObraContratoPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const idObra = Number(params?.id || 0);

  const [data, setData] = useState<ContratoDaObra | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!idObra) return;
    let active = true;
    (async () => {
      try {
        setLoading(true);
        setErr(null);
        const res = await fetch(`/api/v1/engenharia/obras/${idObra}/contrato`, { cache: "no-store" });
        const json = await res.json().catch(() => null);
        if (!res.ok || !json?.success) throw new Error(json?.message || "Erro ao carregar contrato.");
        if (active) setData(json.data as ContratoDaObra);
      } catch (e: any) {
        if (!active) return;
        setErr(e?.message || "Erro ao carregar contrato.");
        setData(null);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [idObra]);

  const saldo = useMemo(() => {
    if (!data) return 0;
    return (data.valorContratado || 0) - (data.valorPago || 0);
  }, [data]);

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">Contrato da Obra</h1>
          <div className="text-sm text-slate-600">Obra #{idObra}</div>
        </div>
        <button className="rounded-lg border px-4 py-2 text-sm" type="button" onClick={() => router.push(`/dashboard/engenharia/obras/${idObra}`)}>
          Voltar para a obra
        </button>
      </div>

      {loading ? <div className="text-sm text-slate-500">Carregando…</div> : null}
      {err ? <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div> : null}

      {!loading && !err && data ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="rounded-xl border bg-white p-4 shadow-sm space-y-2">
            <div className="text-sm font-semibold text-slate-700">Identificação</div>
            <div className="text-sm text-slate-700">
              <div>
                <span className="text-slate-500">Contrato:</span>{" "}
                <span className="font-medium">{data.numeroContrato?.trim() ? data.numeroContrato : "Sem número cadastrado"}</span>
              </div>
              <div>
                <span className="text-slate-500">Status:</span> <span className="font-medium">{data.statusContrato || "—"}</span>
              </div>
              <div>
                <span className="text-slate-500">Obra:</span> <span className="font-medium">{data.nomeObra || `#${data.idObra}`}</span>
              </div>
            </div>
          </div>

          <div className="rounded-xl border bg-white p-4 shadow-sm space-y-2">
            <div className="text-sm font-semibold text-slate-700">Valores</div>
            <div className="text-sm text-slate-700 space-y-1">
              <div className="flex justify-between gap-4">
                <span className="text-slate-500">Contratado</span>
                <span className="font-medium">{formatMoneyBRL(data.valorContratado)}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-slate-500">Executado</span>
                <span className="font-medium">{formatMoneyBRL(data.valorExecutado)}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-slate-500">Pago</span>
                <span className="font-medium">{formatMoneyBRL(data.valorPago)}</span>
              </div>
              <div className="flex justify-between gap-4 border-t pt-2">
                <span className="text-slate-500">Saldo</span>
                <span className="font-semibold">{formatMoneyBRL(saldo)}</span>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

