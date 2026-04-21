"use client";

import { useEffect, useMemo, useState } from "react";
import api from "@/lib/api";
import { realtimeClient } from "@/lib/realtime/client";

type DashboardKpis = {
  totalContratos: number;
  valorContratado: number;
  valorExecutado: number;
  valorPago: number;
  saldoAReceber: number;
  saldoAExecutar: number;
  percentualExecucaoFinanceira: number | null;
  vencendoEm30Dias: number;
  atrasados: number;
};

export default function ContratosDashboardClient() {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [kpis, setKpis] = useState<DashboardKpis | null>(null);

  const query = useMemo(() => {
    const p = new URLSearchParams();
    if (status) p.set("status", status);
    const s = p.toString();
    return s ? `?${s}` : "";
  }, [status]);

  async function carregar() {
    try {
      setLoading(true);
      setErr(null);
      const res = await api.get(`/api/contratos/dashboard${query}`);
      setKpis((res.data as any)?.kpis ?? null);
    } catch (e: any) {
      setKpis(null);
      setErr(e?.response?.data?.message || e?.message || "Erro ao carregar dashboard de contratos");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    carregar();
  }, []);

  useEffect(() => {
    realtimeClient.start(["contratos"]);
    const unsubs = [
      realtimeClient.subscribe("contratos", "contrato_atualizado", () => carregar()),
      realtimeClient.subscribe("contratos", "evento_criado", () => carregar()),
      realtimeClient.subscribe("contratos", "anexo_criado", () => carregar()),
    ];
    return () => {
      for (const u of unsubs) u();
    };
  }, [query]);

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Contratos — Visão Geral</h1>
        <div className="text-sm text-slate-600">Indicadores executivos e alertas para gestão de contratos por engenharia.</div>
      </div>

      <section className="rounded-xl border bg-white p-4 shadow-sm">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <div>
            <div className="text-sm text-slate-600">Status</div>
            <select className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">Todos</option>
              <option value="ATIVO">Ativo</option>
              <option value="PENDENTE">Pendente</option>
              <option value="PARALISADO">Paralisado</option>
              <option value="ENCERRADO">Encerrado</option>
              <option value="FINALIZADO">Finalizado</option>
              <option value="CANCELADO">Cancelado</option>
              <option value="RESCINDIDO">Rescindido</option>
            </select>
          </div>
          <div className="flex items-end md:col-span-3 justify-end">
            <button className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white disabled:opacity-50" type="button" onClick={carregar} disabled={loading}>
              {loading ? "Carregando..." : "Atualizar"}
            </button>
          </div>
        </div>
        {err ? <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div> : null}
      </section>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-5">
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <div className="text-xs text-slate-500">Valor total contratado</div>
          <div className="text-xl font-semibold">{(kpis?.valorContratado ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</div>
        </div>
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <div className="text-xs text-slate-500">Valor executado</div>
          <div className="text-xl font-semibold">{(kpis?.valorExecutado ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</div>
        </div>
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <div className="text-xs text-slate-500">Valor pago</div>
          <div className="text-xl font-semibold">{(kpis?.valorPago ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</div>
        </div>
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <div className="text-xs text-slate-500">Saldo a receber</div>
          <div className="text-xl font-semibold">{(kpis?.saldoAReceber ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</div>
        </div>
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <div className="text-xs text-slate-500">% execução financeira</div>
          <div className="text-xl font-semibold">{kpis?.percentualExecucaoFinanceira == null ? "—" : `${kpis.percentualExecucaoFinanceira.toFixed(2)}%`}</div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <div className="text-xs text-slate-500">Contratos</div>
          <div className="text-xl font-semibold">{kpis?.totalContratos ?? 0}</div>
        </div>
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <div className="text-xs text-slate-500">Vencendo em 30 dias</div>
          <div className="text-xl font-semibold">{kpis?.vencendoEm30Dias ?? 0}</div>
        </div>
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <div className="text-xs text-slate-500">Atrasados</div>
          <div className="text-xl font-semibold">{kpis?.atrasados ?? 0}</div>
        </div>
      </section>
    </div>
  );
}
