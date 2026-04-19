"use client";

import { useEffect, useMemo, useState } from "react";
import { DashboardRhApi } from "@/lib/modules/dashboard-rh/api";
import { DashboardExportButtons } from "@/components/dashboard/DashboardExportButtons";

type Option = { id: number; nome: string };

export default function DashboardRhClient() {
  const [filtros, setFiltros] = useState<{ empresaTotal: boolean; obras: Option[]; unidades: Option[] } | null>(null);
  const [idObra, setIdObra] = useState<number | null>(null);
  const [idUnidade, setIdUnidade] = useState<number | null>(null);

  const [resumo, setResumo] = useState<any | null>(null);
  const [alertas, setAlertas] = useState<any[]>([]);
  const [series, setSeries] = useState<any | null>(null);
  const [distribuicao, setDistribuicao] = useState<{ porObra: Array<{ id: number; nome: string; total: number }>; porUnidade: Array<{ id: number; nome: string; total: number }>} | null>(null);
  const [layout, setLayout] = useState<any>({ dashboardCodigo: "RH", widgets: [] });
  const [error, setError] = useState<string | null>(null);

  const filtroQuery = useMemo(() => ({ idObra, idUnidade }), [idObra, idUnidade]);

  async function carregarTudo() {
    try {
      setError(null);
      const [f, l] = await Promise.all([DashboardRhApi.filtros(), DashboardRhApi.obterLayout()]);
      setFiltros(f);
      setLayout(l);
    } catch (e: any) {
      setError(e?.message || "Erro ao carregar filtros/layout.");
    }
  }

  async function carregarDados() {
    try {
      setError(null);
      const [r, a, s, d] = await Promise.all([
        DashboardRhApi.resumo(filtroQuery),
        DashboardRhApi.alertas(filtroQuery),
        DashboardRhApi.series(filtroQuery),
        DashboardRhApi.distribuicao(filtroQuery),
      ]);
      setResumo(r);
      setAlertas(a);
      setSeries(s);
      setDistribuicao(d);
    } catch (e: any) {
      setError(e?.message || "Erro ao carregar dados do dashboard.");
    }
  }

  async function toggleWidget(widgetCodigo: string) {
    const widgets = (layout.widgets || []).map((w: any) => (w.widgetCodigo === widgetCodigo ? { ...w, visivel: !w.visivel } : w));
    setLayout({ ...layout, widgets });
    await DashboardRhApi.salvarLayout({ dashboardCodigo: "RH", widgets });
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

  if (!filtros || !resumo) return <div className="p-6">Carregando dashboard RH...</div>;

  const obraOptions = filtros.obras || [];
  const unidadeOptions = filtros.unidades || [];

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Dashboard RH</h1>
          <p className="text-sm text-slate-600">Visão de efetivo, admissões, presenças, horas extras e pendências de RH.</p>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <select
            className="rounded-lg border bg-white px-3 py-2 text-sm"
            value={idObra ?? ""}
            onChange={(e) => {
              const v = Number(e.target.value || 0);
              setIdObra(v ? v : null);
              if (v) setIdUnidade(null);
            }}
          >
            <option value="">Todas as obras permitidas</option>
            {obraOptions.map((o) => (
              <option key={o.id} value={o.id}>
                {o.nome}
              </option>
            ))}
          </select>

          <select
            className="rounded-lg border bg-white px-3 py-2 text-sm"
            value={idUnidade ?? ""}
            onChange={(e) => {
              const v = Number(e.target.value || 0);
              setIdUnidade(v ? v : null);
              if (v) setIdObra(null);
            }}
          >
            <option value="">Todas as unidades permitidas</option>
            {unidadeOptions.map((u) => (
              <option key={u.id} value={u.id}>
                {u.nome}
              </option>
            ))}
          </select>

          <div className="rounded-xl border bg-white p-3 shadow-sm">
            <div className="mb-2 text-sm font-medium">Widgets</div>
            <div className="flex flex-wrap gap-2">
              {(layout.widgets || []).map((w: any) => (
                <button
                  key={w.widgetCodigo}
                  onClick={() => toggleWidget(w.widgetCodigo)}
                  className={`rounded-lg border px-3 py-1 text-xs ${w.visivel ? "border-blue-600 bg-blue-600 text-white" : "bg-white"}`}
                  type="button"
                >
                  {w.widgetCodigo}
                </button>
              ))}
            </div>
          </div>

          <DashboardExportButtons
            contexto="RH"
            filtros={{ idObra: idObra ?? undefined, idUnidade: idUnidade ?? undefined }}
            incluirWidgets={(layout.widgets || []).filter((w: any) => w.visivel).map((w: any) => w.widgetCodigo)}
          />
        </div>
      </div>

      {error ? <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}

      {widgetsVisiveis.some((w: any) => w.widgetCodigo === "CARDS_RH") && (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4 xl:grid-cols-6">
          <Card titulo="Funcionários ativos" valor={resumo.funcionariosAtivos} />
          <Card titulo="Pendentes endosso" valor={resumo.cadastrosPendentesEndosso} destaque="warning" />
          <Card titulo="Admissões mês" valor={resumo.admissoesMes} />
          <Card titulo="Desligamentos mês" valor={resumo.desligamentosMes} />
          <Card titulo="Presenças enviadas RH" valor={resumo.presencasEnviadasRh} />
          <Card titulo="Presenças rejeitadas" valor={resumo.presencasRejeitadasRh} destaque="danger" />
          <Card titulo="Assinaturas pendentes" valor={resumo.assinaturasPendentes} destaque="warning" />
          <Card titulo="HE solicitadas" valor={resumo.heSolicitadas} />
          <Card titulo="HE autorizadas" valor={resumo.heAutorizadas} />
          <Card titulo="HE lançadas RH" valor={resumo.heLancadasRh} />
          <Card titulo="Trein. vencidos" valor={resumo.treinamentosVencidos} destaque="danger" />
          <Card titulo="Trein. em alerta" valor={resumo.treinamentosAlerta} destaque="warning" />
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        {widgetsVisiveis.some((w: any) => w.widgetCodigo === "MOVIMENTACAO_RH") && (
          <section className="rounded-xl border bg-white p-4 shadow-sm">
            <h2 className="mb-3 text-lg font-semibold">Movimentação RH</h2>
            <div className="grid grid-cols-2 gap-4">
              <Mini titulo="Admissões no mês" valor={resumo.admissoesMes} />
              <Mini titulo="Desligamentos no mês" valor={resumo.desligamentosMes} />
              <Mini titulo="HE aguardando RH" valor={(resumo.heSolicitadas || 0) + (resumo.heAutorizadas || 0)} />
              <Mini titulo="Presenças p/ conferência" valor={(resumo.presencasEnviadasRh || 0) + (resumo.presencasRejeitadasRh || 0)} />
            </div>
          </section>
        )}

        {widgetsVisiveis.some((w: any) => w.widgetCodigo === "ALERTAS_RH") && (
          <section className="rounded-xl border bg-white p-4 shadow-sm">
            <h2 className="mb-3 text-lg font-semibold">Alertas RH</h2>
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

      {widgetsVisiveis.some((w: any) => w.widgetCodigo === "SERIES_RH") && (
        <section className="rounded-xl border bg-white p-4 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold">Séries dos últimos 6 meses</h2>
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
            <BlocoSerie titulo="Admissões" dados={series?.admissoes || []} />
            <BlocoSerie titulo="Desligamentos" dados={series?.desligamentos || []} />
            <BlocoSerie titulo="HE solicitadas" dados={series?.heSolicitadas || []} />
          </div>
        </section>
      )}

      {widgetsVisiveis.some((w: any) => w.widgetCodigo === "DISTRIBUICAO_RH") && (
        <section className="rounded-xl border bg-white p-4 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold">Indicadores de Funcionários por Local</h2>
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            <BlocoDistribuicao titulo="Funcionários por Obra" dados={distribuicao?.porObra || []} />
            <BlocoDistribuicao titulo="Funcionários por Unidade" dados={distribuicao?.porUnidade || []} />
          </div>
        </section>
      )}
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
      <div className="mt-1 text-lg font-semibold">{Number(valor || 0)}</div>
    </div>
  );
}

function BlocoSerie({ titulo, dados }: { titulo: string; dados: any[] }) {
  const max = Math.max(1, ...dados.map((d) => Number(d.total || 0)));

  return (
    <div>
      <h3 className="mb-2 font-medium">{titulo}</h3>
      <div className="space-y-2">
        {dados.length ? (
          dados.map((d, i) => (
            <div key={i}>
              <div className="mb-1 flex justify-between text-sm">
                <span>{d.periodo}</span>
                <span>{d.total}</span>
              </div>
              <div className="h-3 rounded bg-slate-100">
                <div className="h-3 rounded bg-blue-600" style={{ width: `${(Number(d.total || 0) / max) * 100}%` }} />
              </div>
            </div>
          ))
        ) : (
          <div className="text-sm text-slate-500">Sem dados.</div>
        )}
      </div>
    </div>
  );
}

function BlocoDistribuicao({ titulo, dados }: { titulo: string; dados: Array<{ id: number; nome: string; total: number }> }) {
  return (
    <div>
      <h3 className="mb-2 font-medium">{titulo}</h3>
      <div className="overflow-auto rounded-lg border">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-700">
            <tr>
              <th className="px-3 py-2">Local</th>
              <th className="px-3 py-2 text-right">Qtd.</th>
            </tr>
          </thead>
          <tbody>
            {dados.map((d) => (
              <tr key={`${d.id}-${d.nome}`} className="border-t">
                <td className="px-3 py-2">{d.nome}</td>
                <td className="px-3 py-2 text-right font-semibold">{d.total}</td>
              </tr>
            ))}
            {!dados.length ? (
              <tr>
                <td className="px-3 py-6 text-center text-slate-500" colSpan={2}>
                  Sem dados.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
