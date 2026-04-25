"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { DashboardCeoApi } from "@/lib/modules/dashboard-ceo/api";

export default function DashboardCeoClient() {
  const [resumo, setResumo] = useState<any | null>(null);
  const [financeiro, setFinanceiro] = useState<any | null>(null);
  const [alertas, setAlertas] = useState<any[]>([]);

  async function carregar() {
    const [r, f, a] = await Promise.all([DashboardCeoApi.resumo(), DashboardCeoApi.financeiro(), DashboardCeoApi.alertas()]);
    setResumo(r);
    setFinanceiro(f);
    setAlertas(a);
  }

  useEffect(() => {
    carregar();
  }, []);

  if (!resumo || !financeiro) {
    return <div className="p-6">Carregando dashboard executivo...</div>;
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Dashboard Executivo do CEO</h1>
        <p className="text-sm text-slate-600">Visão consolidada da empresa: contratos, obras, suprimentos, RH e SST.</p>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4 xl:grid-cols-6">
        <Card titulo="Contratos ativos" valor={resumo.contratosAtivos} />
        <Card titulo="Aguardando confirmação" valor={resumo.contratosAguardandoConfirmacao} destaque="warning" />
        <Card titulo="Obras ativas" valor={resumo.obrasAtivas} />
        <Card titulo="Obras paralisadas" valor={resumo.obrasParalisadas} destaque="warning" />
        <Card titulo="Medições pendentes" valor={resumo.medicoesPendentes} />
        <Card titulo="Solicitações urgentes" valor={resumo.solicitacoesUrgentes} destaque="danger" />
        <Card titulo="Funcionários ativos" valor={resumo.funcionariosAtivos} />
        <Card titulo="Presenças p/ RH" valor={resumo.presencasPendentesRh} />
        <Card titulo="Horas extras pendentes" valor={resumo.horasExtrasPendentes} />
        <Card titulo="NCs críticas" valor={resumo.ncsCriticasAbertas} destaque="danger" />
        <Card titulo="CATs pendentes" valor={resumo.catsPendentes} destaque="danger" />
        <Card titulo="Treinamentos vencidos" valor={resumo.treinamentosVencidos} destaque="warning" />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <section className="rounded-xl border bg-white p-4 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold">Resumo financeiro</h2>
          <div className="grid grid-cols-2 gap-4">
            <MiniFinanceiro titulo="Valor contratado" valor={financeiro.valorContratado} />
            <MiniFinanceiro titulo="Executado" valor={financeiro.valorExecutado} />
            <MiniFinanceiro titulo="Pago" valor={financeiro.valorPago} />
            <MiniFinanceiro titulo="Saldo" valor={financeiro.saldoContrato} />
          </div>
        </section>

        <section className="rounded-xl border bg-white p-4 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold">Ações rápidas</h2>
          <div className="grid grid-cols-2 gap-3">
            <Atalho href="/dashboard/contratos" label="Contratos" />
            <Atalho href="/dashboard/engenharia/obras" label="Obras" />
            <Atalho href="/dashboard/obras/mapa" label="Mapa das Obras" />
            <Atalho href="/dashboard/execucao/medicoes" label="Medições" />
            <Atalho href="/dashboard/suprimentos/solicitacoes" label="Suprimentos" />
            <Atalho href="/dashboard/sst/painel" label="Painel SST" />
          </div>
        </section>
      </div>

      <section className="rounded-xl border bg-white p-4 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold">Alertas prioritários</h2>
        <div className="space-y-2">
          {alertas.length ? (
            alertas.map((a, i) => (
              <Link key={i} href={a.rota || "#"} className="block rounded-lg border p-3 hover:bg-slate-50">
                <div className="font-medium">{a.titulo}</div>
                <div className="text-sm text-slate-500">{a.subtitulo}</div>
              </Link>
            ))
          ) : (
            <div className="text-sm text-slate-500">Sem alertas relevantes.</div>
          )}
        </div>
      </section>
    </div>
  );
}

function Card({
  titulo,
  valor,
  destaque,
}: {
  titulo: string;
  valor: number | string;
  destaque?: "danger" | "warning";
}) {
  const cls = destaque === "danger" ? "border-red-200 bg-red-50" : destaque === "warning" ? "border-amber-200 bg-amber-50" : "border-slate-200 bg-white";

  return (
    <div className={`rounded-xl border p-4 shadow-sm ${cls}`}>
      <div className="text-xs text-slate-500">{titulo}</div>
      <div className="mt-1 text-2xl font-semibold">{valor}</div>
    </div>
  );
}

function MiniFinanceiro({ titulo, valor }: { titulo: string; valor: number }) {
  return (
    <div className="rounded-lg border bg-slate-50 p-3">
      <div className="text-xs text-slate-500">{titulo}</div>
      <div className="mt-1 text-lg font-semibold">{valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</div>
    </div>
  );
}

function Atalho({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="rounded-lg border p-3 text-sm font-medium hover:bg-slate-50">
      {label}
    </Link>
  );
}
