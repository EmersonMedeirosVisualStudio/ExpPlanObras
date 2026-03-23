"use client";

import { useEffect, useMemo, useState } from "react";
import { DashboardGerenteApi } from "@/lib/modules/dashboard-gerente/api";

type Option = { id: number; nome: string };

export default function DashboardGerenteClient() {
  const [filtros, setFiltros] = useState<{ empresaTotal: boolean; obras: Option[]; unidades: Option[] } | null>(null);
  const [idObra, setIdObra] = useState<number | null>(null);
  const [idUnidade, setIdUnidade] = useState<number | null>(null);

  const [resumo, setResumo] = useState<any | null>(null);
  const [alertas, setAlertas] = useState<any[]>([]);
  const [layout, setLayout] = useState<any>({ dashboardCodigo: "GERENTE", widgets: [] });
  const [error, setError] = useState<string | null>(null);

  const filtroQuery = useMemo(() => ({ idObra, idUnidade }), [idObra, idUnidade]);

  async function carregarTudo() {
    try {
      setError(null);
      const [f, l] = await Promise.all([DashboardGerenteApi.filtros(), DashboardGerenteApi.obterLayout()]);
      setFiltros(f);
      setLayout(l);
    } catch (e: any) {
      setError(e?.message || "Erro ao carregar filtros/layout.");
    }
  }

  async function carregarDados() {
    try {
      setError(null);
      const [r, a] = await Promise.all([DashboardGerenteApi.resumo(filtroQuery), DashboardGerenteApi.alertas(filtroQuery)]);
      setResumo(r);
      setAlertas(a);
    } catch (e: any) {
      setError(e?.message || "Erro ao carregar dados do dashboard.");
    }
  }

  async function toggleWidget(widgetCodigo: string) {
    const widgets = (layout.widgets || []).map((w: any) => (w.widgetCodigo === widgetCodigo ? { ...w, visivel: !w.visivel } : w));
    setLayout({ ...layout, widgets });
    await DashboardGerenteApi.salvarLayout({ dashboardCodigo: "GERENTE", widgets });
  }

  useEffect(() => {
    (async () => {
      await carregarTudo();
      await carregarDados();
    })();
  }, []);

  useEffect(() => {
    if (!filtros) return;
    carregarDados();
  }, [idObra, idUnidade]);

  const widgetsVisiveis = useMemo(() => (layout.widgets || []).filter((w: any) => w.visivel), [layout.widgets]);

  if (!filtros || !resumo) return <div className="p-6">Carregando dashboard do gerente...</div>;

  const obraOptions = filtros.obras || [];
  const unidadeOptions = filtros.unidades || [];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">Dashboard do Gerente</h1>
          <p className="text-sm text-slate-600">Filtrado por obras/unidades da abrangência do usuário.</p>
        </div>

        <div className="flex gap-2 items-center flex-wrap">
          <select
            value={idObra || ""}
            onChange={(e) => {
              const v = Number(e.target.value || 0);
              setIdObra(v ? v : null);
              if (v) setIdUnidade(null);
            }}
            className="rounded-lg border bg-white px-3 py-2 text-sm"
          >
            <option value="">Todas as obras</option>
            {obraOptions.map((o) => (
              <option key={o.id} value={o.id}>
                {o.nome}
              </option>
            ))}
          </select>

          <select
            value={idUnidade || ""}
            onChange={(e) => {
              const v = Number(e.target.value || 0);
              setIdUnidade(v ? v : null);
              if (v) setIdObra(null);
            }}
            className="rounded-lg border bg-white px-3 py-2 text-sm"
          >
            <option value="">Todas as unidades</option>
            {unidadeOptions.map((u) => (
              <option key={u.id} value={u.id}>
                {u.nome}
              </option>
            ))}
          </select>

          <button className="rounded-lg border px-4 py-2 text-sm" onClick={carregarDados} type="button">
            Atualizar
          </button>
        </div>
      </div>

      {error ? <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}

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

      {widgetsVisiveis.some((w: any) => w.widgetCodigo === "CARDS_GERENTE") && (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4 xl:grid-cols-8">
          <Card titulo="Obras sob gestão" valor={resumo.obrasSobGestao} />
          <Card titulo="Medições pendentes" valor={resumo.medicoesPendentes} />
          <Card titulo="Solicitações urgentes" valor={resumo.solicitacoesUrgentes} destaque="danger" />
          <Card titulo="Funcionários ativos" valor={resumo.funcionariosAtivos} />
          <Card titulo="Presenças pendentes" valor={resumo.presencasPendentes} destaque="warning" />
          <Card titulo="HE pendentes" valor={resumo.horasExtrasPendentes} />
          <Card titulo="NCs abertas" valor={resumo.ncsAbertas} destaque="danger" />
          <Card titulo="Acidentes mês" valor={resumo.acidentesMes} />
          <Card titulo="Checklists atrasados" valor={resumo.checklistsAtrasados} destaque="warning" />
          <Card titulo="Trein. vencidos" valor={resumo.treinamentosVencidos} destaque="warning" />
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        {widgetsVisiveis.some((w: any) => w.widgetCodigo === "FINANCEIRO_GERENTE") && (
          <section className="rounded-xl border bg-white p-4 shadow-sm">
            <h2 className="mb-3 text-lg font-semibold">Financeiro</h2>
            <div className="grid grid-cols-2 gap-4">
              <Mini titulo="Contratado" valor={resumo.valorContratado} />
              <Mini titulo="Executado" valor={resumo.valorExecutado} />
              <Mini titulo="Pago" valor={resumo.valorPago} />
              <Mini titulo="Saldo" valor={resumo.saldoContrato} />
            </div>
          </section>
        )}

        {widgetsVisiveis.some((w: any) => w.widgetCodigo === "ALERTAS_GERENTE") && (
          <section className="rounded-xl border bg-white p-4 shadow-sm">
            <h2 className="mb-3 text-lg font-semibold">Alertas</h2>
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
      <div className="mt-1 text-lg font-semibold">{Number(valor || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</div>
    </div>
  );
}

