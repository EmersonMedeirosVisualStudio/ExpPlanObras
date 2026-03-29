"use client";

import { useEffect, useMemo, useState } from "react";
import { DashboardEngenhariaApi } from "@/lib/modules/dashboard-engenharia/api";
import { DashboardExportButtons } from "@/components/dashboard/DashboardExportButtons";
import { useRealtimeEvent } from "@/lib/realtime/hooks";
import type { DashboardEngenhariaCronogramaAcompanhamentoDTO } from "@/lib/modules/dashboard-engenharia/types";

type Option = { id: number; nome: string };

export default function DashboardEngenhariaClient() {
  const [filtros, setFiltros] = useState<{ empresaTotal: boolean; obras: Option[]; unidades: Option[] } | null>(null);
  const [idObra, setIdObra] = useState<number | null>(null);
  const [idUnidade, setIdUnidade] = useState<number | null>(null);

  const [resumo, setResumo] = useState<any | null>(null);
  const [alertas, setAlertas] = useState<any[]>([]);
  const [series, setSeries] = useState<any[]>([]);
  const [obrasRisco, setObrasRisco] = useState<any[]>([]);
  const [medicoes, setMedicoes] = useState<any[]>([]);
  const [cronograma, setCronograma] = useState<DashboardEngenhariaCronogramaAcompanhamentoDTO | null>(null);
  const [layout, setLayout] = useState<any>({ dashboardCodigo: "ENGENHARIA", widgets: [] });
  const [error, setError] = useState<string | null>(null);

  const filtroQuery = useMemo(() => ({ idObra, idUnidade }), [idObra, idUnidade]);

  async function carregarTudo() {
    try {
      setError(null);
      const [f, l] = await Promise.all([DashboardEngenhariaApi.filtros(), DashboardEngenhariaApi.obterLayout()]);
      setFiltros(f);
      setLayout(l);
    } catch (e: any) {
      setError(e?.message || "Erro ao carregar filtros/layout.");
    }
  }

  async function carregarDados() {
    try {
      setError(null);
      const [r, a, s, or, mp] = await Promise.all([
        DashboardEngenhariaApi.resumo(filtroQuery),
        DashboardEngenhariaApi.alertas(filtroQuery),
        DashboardEngenhariaApi.series(filtroQuery),
        DashboardEngenhariaApi.obrasRisco(filtroQuery),
        DashboardEngenhariaApi.medicoesPendentes(filtroQuery),
      ]);
      setResumo(r);
      setAlertas(a);
      setSeries(s);
      setObrasRisco(or);
      setMedicoes(mp);
      if (filtroQuery.idObra) {
        try {
          const c = await DashboardEngenhariaApi.cronogramaAcompanhamento({ idObra: filtroQuery.idObra });
          setCronograma(c);
        } catch {
          setCronograma(null);
        }
      } else {
        setCronograma(null);
      }
    } catch (e: any) {
      setError(e?.message || "Erro ao carregar dados do painel.");
    }
  }

  async function toggleWidget(widgetCodigo: string) {
    const widgets = (layout.widgets || []).map((w: any) => (w.widgetCodigo === widgetCodigo ? { ...w, visivel: !w.visivel } : w));
    setLayout({ ...layout, widgets });
    await DashboardEngenhariaApi.salvarLayout({ dashboardCodigo: "ENGENHARIA", widgets });
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

  useRealtimeEvent("dashboard-engenharia", "dashboard.refresh", () => {
    carregarDados();
  });

  const widgetsVisiveis = useMemo(() => (layout.widgets || []).filter((w: any) => w.visivel), [layout.widgets]);

  if (!filtros || !resumo) return <div className="p-6">Carregando painel Engenharia...</div>;

  const obraOptions = filtros.obras || [];
  const unidadeOptions = filtros.unidades || [];

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">Dashboard Engenharia / Obras</h1>
          <p className="text-sm text-slate-600">Visão de status de obras, medições, riscos operacionais e alertas.</p>
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
          <DashboardExportButtons
            contexto="ENGENHARIA"
            filtros={{ idObra: idObra ?? undefined, idUnidade: idUnidade ?? undefined }}
            incluirWidgets={(layout.widgets || []).filter((w: any) => w.visivel).map((w: any) => w.widgetCodigo)}
          />
        </div>
      </div>

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

      {error ? <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}

      {widgetsVisiveis.some((w: any) => w.widgetCodigo === "CARDS_ENGENHARIA") && (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4 xl:grid-cols-6">
          <Card titulo="Obras ativas" valor={resumo.obrasAtivas} />
          <Card titulo="Obras paralisadas" valor={resumo.obrasParalisadas} destaque="warning" />
          <Card titulo="Concluídas no mês" valor={resumo.obrasConcluidasMes} />
          <Card titulo="Medições pendentes" valor={resumo.medicoesPendentes} destaque="warning" />
          <Card titulo="Medições atrasadas" valor={resumo.medicoesAtrasadas} destaque="danger" />
          <Card titulo="Contratos vencendo 30d" valor={resumo.contratosVencendo30d} destaque="warning" />
          <Card titulo="Solicitações urgentes" valor={resumo.solicitacoesUrgentesObra} destaque="danger" />
          <Card titulo="NCs críticas" valor={resumo.ncsCriticasObra} destaque="danger" />
          <Card titulo="Acidentes no mês" valor={resumo.acidentesMes} destaque="warning" />
          <Card titulo="Checklists atrasados" valor={resumo.checklistsAtrasados} destaque="warning" />
          <Card titulo="Executado mês" valor={Number(resumo.valorExecutadoMes || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} />
          <Card titulo="Medido mês" valor={Number(resumo.valorMedidoMes || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} />
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        {widgetsVisiveis.some((w: any) => w.widgetCodigo === "ALERTAS_ENGENHARIA") && (
          <section className="rounded-xl border bg-white p-4 shadow-sm">
            <h2 className="mb-3 text-lg font-semibold">Alertas</h2>
            <div className="space-y-2">
              {alertas.length ? (
                alertas.map((a, i) => (
                  <div key={i} className="rounded-lg border p-3">
                    <div className="font-medium">{a.titulo}</div>
                    <div className="text-sm text-slate-500">{a.subtitulo}</div>
                    {a.criticidade ? <div className="mt-1 text-xs text-slate-400">Criticidade: {a.criticidade}</div> : null}
                  </div>
                ))
              ) : (
                <div className="text-sm text-slate-500">Sem alertas no momento.</div>
              )}
            </div>
          </section>
        )}

        {widgetsVisiveis.some((w: any) => w.widgetCodigo === "SERIES_ENGENHARIA") && (
          <section className="rounded-xl border bg-white p-4 shadow-sm">
            <h2 className="mb-3 text-lg font-semibold">Séries dos últimos 6 meses</h2>
            <BlocoSerie titulo="Medições emitidas" dados={series.map((x) => ({ periodo: x.referencia, total: x.medicoesEmitidas }))} />
            <BlocoSerie titulo="Obras iniciadas" dados={series.map((x) => ({ periodo: x.referencia, total: x.obrasIniciadas }))} />
            <BlocoSerie titulo="Ocorrências (acidentes)" dados={series.map((x) => ({ periodo: x.referencia, total: x.ocorrencias }))} />
          </section>
        )}
      </div>

      {widgetsVisiveis.some((w: any) => w.widgetCodigo === "OBRAS_RISCO") && (
        <section className="rounded-xl border bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-lg font-semibold">Obras com maior risco</h2>
          {obrasRisco.length ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-slate-500">
                    <th className="py-2">Obra</th>
                    <th className="py-2">Status</th>
                    <th className="py-2">Medições</th>
                    <th className="py-2">Urgências</th>
                    <th className="py-2">NCs</th>
                    <th className="py-2">Acidentes</th>
                    <th className="py-2">Checklists</th>
                    <th className="py-2">Score</th>
                  </tr>
                </thead>
                <tbody>
                  {obrasRisco.map((o, i) => (
                    <tr key={i} className="border-t">
                      <td className="py-2">{o.nomeObra}</td>
                      <td className="py-2">{o.statusObra}</td>
                      <td className="py-2">{o.medicoesPendentes}</td>
                      <td className="py-2">{o.solicitacoesUrgentes}</td>
                      <td className="py-2">{o.ncsCriticas}</td>
                      <td className="py-2">{o.acidentes90d}</td>
                      <td className="py-2">{o.checklistsAtrasados}</td>
                      <td className="py-2">{o.scoreRisco}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-sm text-slate-500">Sem dados.</div>
          )}
        </section>
      )}

      {widgetsVisiveis.some((w: any) => w.widgetCodigo === "MEDICOES_PENDENTES") && (
        <section className="rounded-xl border bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-lg font-semibold">Medições pendentes</h2>
          {medicoes.length ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-slate-500">
                    <th className="py-2">ID</th>
                    <th className="py-2">Contrato</th>
                    <th className="py-2">Obra</th>
                    <th className="py-2">Status</th>
                    <th className="py-2">Prevista</th>
                    <th className="py-2">Atraso</th>
                    <th className="py-2">Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {medicoes.map((m, i) => (
                    <tr key={i} className="border-t">
                      <td className="py-2">{m.idMedicao}</td>
                      <td className="py-2">{m.contratoNumero || "-"}</td>
                      <td className="py-2">{m.obraNome}</td>
                      <td className="py-2">{m.status}</td>
                      <td className="py-2">{m.dataPrevistaEnvio ? new Date(m.dataPrevistaEnvio).toLocaleDateString("pt-BR") : "-"}</td>
                      <td className="py-2">{m.atrasoDias ? `${m.atrasoDias}d` : "-"}</td>
                      <td className="py-2">{Number(m.valorMedido || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-sm text-slate-500">Sem medições pendentes.</div>
          )}
        </section>
      )}

      {widgetsVisiveis.some((w: any) => w.widgetCodigo === "CRONOGRAMA_ACOMPANHAMENTO") && (
        <section className="rounded-xl border bg-white p-4 shadow-sm">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <h2 className="mb-1 text-lg font-semibold">Acompanhamento do cronograma</h2>
              <div className="text-sm text-slate-600">
                {idObra ? (
                  <>
                    Obra selecionada: <span className="font-medium">#{idObra}</span>
                  </>
                ) : (
                  "Selecione uma obra para ver o cronograma e a execução."
                )}
              </div>
            </div>
            {cronograma?.numeroContrato ? (
              <div className="text-sm text-slate-600">
                Contrato: <span className="font-medium">{cronograma.numeroContrato}</span>
              </div>
            ) : null}
          </div>

          {cronograma?.warnings?.length ? (
            <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              {cronograma.warnings.join(" ")}
            </div>
          ) : null}

          {idObra && cronograma?.meses?.length ? (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-slate-500">
                    <th className="py-2">Mês</th>
                    <th className="py-2">Planejado (%)</th>
                    <th className="py-2">Executado físico (%)</th>
                    <th className="py-2">Executado financeiro (%)</th>
                    <th className="py-2">Medido mês</th>
                  </tr>
                </thead>
                <tbody>
                  {cronograma.meses.map((m) => (
                    <tr key={m.competencia} className="border-t">
                      <td className="py-2">{m.competencia}</td>
                      <td className="py-2">
                        {m.planejado.percentualAcumulado == null ? "-" : `${Math.round(m.planejado.percentualAcumulado * 100)}%`}
                      </td>
                      <td className="py-2">
                        {m.executado.percentualQuantidadeAcumulado == null ? "-" : `${Math.round(m.executado.percentualQuantidadeAcumulado * 100)}%`}
                      </td>
                      <td className="py-2">
                        {m.executado.percentualFinanceiroAcumulado == null ? "-" : `${Math.round(m.executado.percentualFinanceiroAcumulado * 100)}%`}
                      </td>
                      <td className="py-2">
                        {Number(m.executado.valorMedidoMes || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : idObra ? (
            <div className="mt-4 text-sm text-slate-500">Sem cronograma cadastrado ou sem meses no cronograma.</div>
          ) : null}
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
