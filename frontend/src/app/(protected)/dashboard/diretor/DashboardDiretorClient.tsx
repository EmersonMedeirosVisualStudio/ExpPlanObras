"use client";

import { useEffect, useMemo, useState } from "react";
import { DashboardDiretorApi } from "@/lib/modules/dashboard-diretor/api";

export default function DashboardDiretorClient() {
  const [resumo, setResumo] = useState<any | null>(null);
  const [alertas, setAlertas] = useState<any[]>([]);
  const [layout, setLayout] = useState<any>({ dashboardCodigo: "DIRETOR", widgets: [] });

  async function carregar() {
    const [r, a, l] = await Promise.all([DashboardDiretorApi.resumo(), DashboardDiretorApi.alertas(), DashboardDiretorApi.obterLayout()]);
    setResumo(r);
    setAlertas(a);
    setLayout(l);
  }

  async function toggleWidget(widgetCodigo: string) {
    const widgets = (layout.widgets || []).map((w: any) => (w.widgetCodigo === widgetCodigo ? { ...w, visivel: !w.visivel } : w));
    setLayout({ ...layout, widgets });
    await DashboardDiretorApi.salvarLayout({ dashboardCodigo: "DIRETOR", widgets });
  }

  useEffect(() => {
    carregar();
  }, []);

  const widgetsVisiveis = useMemo(() => (layout.widgets || []).filter((w: any) => w.visivel), [layout.widgets]);

  if (!resumo) return <div className="p-6">Carregando dashboard da diretoria...</div>;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Dashboard da Diretoria</h1>
          <p className="text-sm text-slate-600">Visão consolidada da diretoria conforme a abrangência do usuário.</p>
        </div>
        <div className="rounded-xl border bg-white p-3 shadow-sm">
          <div className="mb-2 text-sm font-medium">Widgets</div>
          <div className="flex flex-wrap gap-2">
            {(layout.widgets || []).map((w: any) => (
              <button
                key={w.widgetCodigo}
                onClick={() => toggleWidget(w.widgetCodigo)}
                className={`rounded-lg border px-3 py-1 text-xs ${w.visivel ? "bg-blue-600 text-white border-blue-600" : "bg-white"}`}
              >
                {w.widgetCodigo}
              </button>
            ))}
          </div>
        </div>
      </div>

      {widgetsVisiveis.some((w: any) => w.widgetCodigo === "CARDS_OPERACIONAIS") && (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4 xl:grid-cols-8">
          <Card titulo="Contratos ativos" valor={resumo.contratosAtivos} />
          <Card titulo="Obras ativas" valor={resumo.obrasAtivas} />
          <Card titulo="Medições pendentes" valor={resumo.medicoesPendentes} />
          <Card titulo="Solicitações urgentes" valor={resumo.solicitacoesUrgentes} destaque="danger" />
          <Card titulo="Funcionários ativos" valor={resumo.funcionariosAtivos} />
          <Card titulo="NCs críticas" valor={resumo.ncsCriticas} destaque="danger" />
          <Card titulo="CATs pendentes" valor={resumo.catsPendentes} destaque="danger" />
          <Card titulo="Trein. vencidos" valor={resumo.treinamentosVencidos} destaque="warning" />
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        {widgetsVisiveis.some((w: any) => w.widgetCodigo === "FINANCEIRO_DIRETORIA") && (
          <section className="rounded-xl border bg-white p-4 shadow-sm">
            <h2 className="mb-3 text-lg font-semibold">Financeiro da diretoria</h2>
            <div className="grid grid-cols-2 gap-4">
              <Mini titulo="Contratado" valor={resumo.valorContratado} />
              <Mini titulo="Executado" valor={resumo.valorExecutado} />
              <Mini titulo="Pago" valor={resumo.valorPago} />
              <Mini titulo="Saldo" valor={resumo.saldoContrato} />
            </div>
          </section>
        )}

        {widgetsVisiveis.some((w: any) => w.widgetCodigo === "ALERTAS_DIRETORIA") && (
          <section className="rounded-xl border bg-white p-4 shadow-sm">
            <h2 className="mb-3 text-lg font-semibold">Alertas da diretoria</h2>
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
        )}
      </div>
    </div>
  );
}

function Card({ titulo, valor, destaque }: { titulo: string; valor: number | string; destaque?: "danger" | "warning" }) {
  const cls =
    destaque === "danger"
      ? "border-red-200 bg-red-50"
      : destaque === "warning"
        ? "border-amber-200 bg-amber-50"
        : "border-slate-200 bg-white";

  return (
    <div className={`rounded-xl border p-4 shadow-sm ${cls}`}>
      <div className="text-xs text-slate-500">{titulo}</div>
      <div className="mt-1 text-2xl font-semibold">{valor}</div>
    </div>
  );
}

function Mini({ titulo, valor }: { titulo: string; valor: number }) {
  return (
    <div className="rounded-lg border bg-slate-50 p-3">
      <div className="text-xs text-slate-500">{titulo}</div>
      <div className="mt-1 text-lg font-semibold">{valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</div>
    </div>
  );
}
