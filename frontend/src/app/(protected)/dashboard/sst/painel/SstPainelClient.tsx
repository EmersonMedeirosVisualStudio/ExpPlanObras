"use client";

import { useEffect, useMemo, useState } from "react";
import { SstPainelApi } from "@/lib/modules/sst-painel/api";
import { DashboardExportButtons } from "@/components/dashboard/DashboardExportButtons";

type Option = { id: number; nome: string };

export default function SstPainelClient() {
  const [filtros, setFiltros] = useState<{ empresaTotal: boolean; obras: Option[]; unidades: Option[] } | null>(null);
  const [idObra, setIdObra] = useState<number | null>(null);
  const [idUnidade, setIdUnidade] = useState<number | null>(null);

  const [resumo, setResumo] = useState<any | null>(null);
  const [alertas, setAlertas] = useState<any[]>([]);
  const [series, setSeries] = useState<any | null>(null);
  const [ranking, setRanking] = useState<any[]>([]);
  const [layout, setLayout] = useState<any>({ dashboardCodigo: "SST", widgets: [] });
  const [error, setError] = useState<string | null>(null);

  const filtroQuery = useMemo(() => ({ idObra, idUnidade }), [idObra, idUnidade]);

  async function carregarTudo() {
    try {
      setError(null);
      const [f, l] = await Promise.all([SstPainelApi.filtros(), SstPainelApi.obterLayout()]);
      setFiltros(f);
      setLayout(l);
    } catch (e: any) {
      setError(e?.message || "Erro ao carregar filtros/layout.");
    }
  }

  async function carregarDados() {
    try {
      setError(null);
      const [r, a, s, rk] = await Promise.all([
        SstPainelApi.resumo(filtroQuery),
        SstPainelApi.alertas(filtroQuery),
        SstPainelApi.series(filtroQuery),
        SstPainelApi.ranking(filtroQuery),
      ]);
      setResumo(r);
      setAlertas(a);
      setSeries(s);
      setRanking(rk);
    } catch (e: any) {
      setError(e?.message || "Erro ao carregar dados do painel.");
    }
  }

  async function toggleWidget(widgetCodigo: string) {
    const widgets = (layout.widgets || []).map((w: any) => (w.widgetCodigo === widgetCodigo ? { ...w, visivel: !w.visivel } : w));
    setLayout({ ...layout, widgets });
    await SstPainelApi.salvarLayout({ dashboardCodigo: "SST", widgets });
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

  if (!filtros || !resumo) return <div className="p-6">Carregando painel SST...</div>;

  const obraOptions = filtros.obras || [];
  const unidadeOptions = filtros.unidades || [];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">Painel Gerencial SST</h1>
          <p className="text-sm text-slate-600">Indicadores operacionais e executivos de segurança do trabalho.</p>
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

          <div className="rounded-xl border bg-white p-3 shadow-sm">
            <div className="mb-2 text-sm font-medium">Widgets</div>
            <div className="flex flex-wrap gap-2">
              {(layout.widgets || []).map((w: any) => (
                <button
                  key={w.widgetCodigo}
                  onClick={() => toggleWidget(w.widgetCodigo)}
                  className={`rounded-lg border px-3 py-1 text-xs ${w.visivel ? "bg-blue-600 text-white border-blue-600" : "bg-white"}`}
                  type="button"
                >
                  {w.widgetCodigo}
                </button>
              ))}
            </div>
          </div>

          <DashboardExportButtons
            contexto="SST"
            filtros={{ idObra: idObra ?? undefined, idUnidade: idUnidade ?? undefined }}
            incluirWidgets={(layout.widgets || []).filter((w: any) => w.visivel).map((w: any) => w.widgetCodigo)}
          />
        </div>
      </div>

      {error ? <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}

      {widgetsVisiveis.some((w: any) => w.widgetCodigo === "CARDS_SST") && (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4 xl:grid-cols-6">
          <Card titulo="NC abertas" valor={resumo.ncAbertas} />
          <Card titulo="NC vencidas" valor={resumo.ncVencidas} destaque="danger" />
          <Card titulo="Acidentes mês" valor={resumo.acidentesMes} />
          <Card titulo="CAT pendentes" valor={resumo.catPendentes} destaque="warning" />
          <Card titulo="Trein. vencidos" valor={resumo.treinamentosVencidos} destaque="danger" />
          <Card titulo="Trein. alerta" valor={resumo.treinamentosAlerta} destaque="warning" />
          <Card titulo="Troca EPI pendente" valor={resumo.epiTrocaPendente} />
          <Card titulo="CA vencido" valor={resumo.epiCaVencido} destaque="danger" />
          <Card titulo="Checklist pendente" valor={resumo.checklistsPendentes} />
          <Card titulo="Checklist atrasado" valor={resumo.checklistsAtrasados} destaque="danger" />
          <Card titulo="Dias sem acidente c/ afast." valor={resumo.diasSemAcidenteComAfastamento ?? "-"} />
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        {widgetsVisiveis.some((w: any) => w.widgetCodigo === "ALERTAS_SST") && (
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
        )}

        {widgetsVisiveis.some((w: any) => w.widgetCodigo === "SERIES_SST") && (
          <section className="rounded-xl border bg-white p-4">
            <h2 className="mb-3 text-lg font-semibold">Séries dos últimos 6 meses</h2>
            <BlocoSerie titulo="Acidentes" dados={series?.acidentes || []} />
            <BlocoSerie titulo="Não conformidades" dados={series?.ncs || []} />
            <BlocoSerie titulo="Treinamentos por vencimento" dados={series?.treinamentosVencidos || []} />
          </section>
        )}
      </div>

      {widgetsVisiveis.some((w: any) => w.widgetCodigo === "RANKING_SST") && (
        <section className="rounded-xl border bg-white p-4">
          <h2 className="mb-3 text-lg font-semibold">Ranking de risco SST</h2>
          <div className="space-y-2">
            {ranking.length ? (
              ranking.map((r, i) => (
                <div key={i} className="rounded-lg border p-3">
                  <div className="font-medium">
                    {r.tipoLocal}: {r.nome}
                  </div>
                  <div className="text-xs text-slate-600">
                    NCs críticas {r.ncsCriticas} • Acidentes 90d {r.acidentes90d} • Checklists atrasados {r.checklistsAtrasados} • Trein. vencidos {r.treinamentosVencidos} • EPI troca vencida {r.episTrocaVencida}
                  </div>
                </div>
              ))
            ) : (
              <div className="text-sm text-slate-500">Sem dados de ranking.</div>
            )}
          </div>
        </section>
      )}
    </div>
  );
}

function Card({
  titulo,
  valor,
  destaque,
}: {
  titulo: string;
  valor: string | number;
  destaque?: "danger" | "warning";
}) {
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

function BlocoSerie({ titulo, dados }: { titulo: string; dados: any[] }) {
  const max = Math.max(1, ...dados.map((d) => Number(d.total || 0)));

  return (
    <div className="mb-5">
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
