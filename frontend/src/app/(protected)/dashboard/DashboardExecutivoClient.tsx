"use client";

import { useEffect, useState } from "react";
import SstResumoWidget from "@/components/dashboard/widgets/SstResumoWidget";

type ApiResponse<T> = { success: boolean; message?: string; data: T };

async function api<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const res = await fetch(input, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
    cache: "no-store",
  });
  const json = (await res.json()) as ApiResponse<T>;
  if (!res.ok || !json.success) throw new Error(json.message || "Erro");
  return json.data;
}

function Card({ titulo, valor }: { titulo: string; valor: string | number }) {
  return (
    <div className="rounded-xl border bg-white p-4 shadow-sm">
      <div className="text-xs text-slate-500">{titulo}</div>
      <div className="mt-1 text-2xl font-semibold">{valor}</div>
    </div>
  );
}

export default function DashboardExecutivoClient() {
  const [data, setData] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function carregar() {
    try {
      setError(null);
      setData(await api<any>("/api/v1/dashboard/executivo"));
    } catch (e: any) {
      setError(e?.message || "Erro ao carregar dashboard.");
      setData(null);
    }
  }

  useEffect(() => {
    carregar();
  }, []);

  if (!data && !error) return <div className="p-6">Carregando dashboard executivo...</div>;

  const cards = data?.cards || {};
  const financeiro = data?.financeiro || {};
  const alertas: any[] = data?.alertas || [];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">Dashboard Executivo</h1>
          <p className="text-sm text-slate-600">Visão consolidada de contratos, obras, medições, suprimentos, RH e SST.</p>
        </div>
        <button className="rounded-lg border px-4 py-2 text-sm" onClick={carregar} type="button">
          Atualizar
        </button>
      </div>

      {error ? <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4 xl:grid-cols-6">
        <Card titulo="Contratos ativos" valor={cards.contratosAtivos ?? 0} />
        <Card titulo="Contratos aguardando" valor={cards.contratosAguardandoConfirmacao ?? 0} />
        <Card titulo="Obras ativas" valor={cards.obrasAtivas ?? 0} />
        <Card titulo="Obras paralisadas" valor={cards.obrasParalisadas ?? 0} />
        <Card titulo="Medições pendentes" valor={cards.medicoesPendentes ?? 0} />
        <Card titulo="Materiais urgentes" valor={cards.solicitacoesUrgentes ?? 0} />
        <Card titulo="Funcionários ativos" valor={cards.funcionariosAtivos ?? 0} />
        <Card titulo="Presenças pendentes" valor={cards.presencasPendentesRh ?? 0} />
        <Card titulo="Horas extras pendentes" valor={cards.horasExtrasPendentes ?? 0} />
        <Card titulo="NCs críticas abertas" valor={cards.ncsCriticasAbertas ?? 0} />
        <Card titulo="CATs pendentes" valor={cards.catsPendentes ?? 0} />
        <Card titulo="Trein. vencidos" valor={cards.treinamentosVencidos ?? 0} />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <section className="rounded-xl border bg-white p-4">
          <h2 className="mb-3 text-lg font-semibold">Financeiro</h2>
          <div className="grid grid-cols-2 gap-4">
            <Card titulo="Valor contratado" valor={Number(financeiro.valorContratado || 0).toLocaleString("pt-BR")} />
            <Card titulo="Valor executado" valor={Number(financeiro.valorExecutado || 0).toLocaleString("pt-BR")} />
            <Card titulo="Valor pago" valor={Number(financeiro.valorPago || 0).toLocaleString("pt-BR")} />
            <Card titulo="Saldo contratual" valor={Number(financeiro.saldoContratual || 0).toLocaleString("pt-BR")} />
          </div>
        </section>

        <section className="rounded-xl border bg-white p-4">
          <h2 className="mb-3 text-lg font-semibold">Alertas prioritários</h2>
          <div className="space-y-2">
            {alertas.length ? (
              alertas.map((a, i) => (
                <div key={i} className="rounded-lg border p-3">
                  <div className="font-medium">{a.titulo}</div>
                  <div className="text-sm text-slate-500">{a.subtitulo}</div>
                </div>
              ))
            ) : (
              <div className="text-sm text-slate-500">Sem alertas no momento.</div>
            )}
          </div>
        </section>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <section className="rounded-xl border bg-white p-4">
          <h2 className="mb-3 text-lg font-semibold">Ações rápidas</h2>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <a className="rounded-lg border p-3 hover:bg-slate-50" href="/dashboard/mapa-obras">
              Abrir mapa das obras
            </a>
            <a className="rounded-lg border p-3 hover:bg-slate-50" href="/dashboard/obras">
              Abrir obras
            </a>
            <a className="rounded-lg border p-3 hover:bg-slate-50" href="/dashboard/rh/presencas">
              Abrir presenças
            </a>
            <a className="rounded-lg border p-3 hover:bg-slate-50" href="/dashboard/sst/painel">
              Abrir painel SST
            </a>
          </div>
        </section>

        <SstResumoWidget />
      </div>
    </div>
  );
}

