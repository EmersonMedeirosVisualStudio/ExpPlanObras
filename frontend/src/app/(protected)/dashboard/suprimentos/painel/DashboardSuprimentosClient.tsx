"use client";

import { useEffect, useMemo, useState } from "react";
import { DashboardSuprimentosApi } from "@/lib/modules/dashboard-suprimentos/api";
import { DashboardExportButtons } from "@/components/dashboard/DashboardExportButtons";

type Option = { id: number; nome: string };

export default function DashboardSuprimentosClient() {
  const [filtros, setFiltros] = useState<{ empresaTotal: boolean; obras: Option[]; unidades: Option[]; almoxarifados?: Option[] } | null>(null);
  const [idObra, setIdObra] = useState<number | null>(null);
  const [idUnidade, setIdUnidade] = useState<number | null>(null);
  const [idAlmoxarifado, setIdAlmoxarifado] = useState<number | null>(null);

  const [resumo, setResumo] = useState<any | null>(null);
  const [alertas, setAlertas] = useState<any[]>([]);
  const [series, setSeries] = useState<any[]>([]);
  const [consumoPorObra, setConsumoPorObra] = useState<any[]>([]);
  const [estoqueCritico, setEstoqueCritico] = useState<any[]>([]);
  const [comprasAndamento, setComprasAndamento] = useState<any[]>([]);
  const [layout, setLayout] = useState<any>({ dashboardCodigo: "SUPRIMENTOS", widgets: [] });
  const [error, setError] = useState<string | null>(null);

  const filtroQuery = useMemo(() => ({ idObra, idUnidade, idAlmoxarifado }), [idObra, idUnidade, idAlmoxarifado]);

  async function carregarTudo() {
    try {
      setError(null);
      const [f, l] = await Promise.all([DashboardSuprimentosApi.filtros(), DashboardSuprimentosApi.obterLayout()]);
      setFiltros(f);
      setLayout(l);
    } catch (e: any) {
      setError(e?.message || "Erro ao carregar filtros/layout.");
    }
  }

  async function carregarDados() {
    try {
      setError(null);
      const [r, a, s, co, e, c] = await Promise.all([
        DashboardSuprimentosApi.resumo(filtroQuery),
        DashboardSuprimentosApi.alertas(filtroQuery),
        DashboardSuprimentosApi.series(filtroQuery),
        DashboardSuprimentosApi.consumoPorObra(filtroQuery),
        DashboardSuprimentosApi.estoqueCritico(filtroQuery),
        DashboardSuprimentosApi.comprasAndamento(filtroQuery),
      ]);
      setResumo(r);
      setAlertas(a);
      setSeries(s);
      setConsumoPorObra(co);
      setEstoqueCritico(e);
      setComprasAndamento(c);
    } catch (e: any) {
      setError(e?.message || "Erro ao carregar dados do painel.");
    }
  }

  async function toggleWidget(widgetCodigo: string) {
    const widgets = (layout.widgets || []).map((w: any) => (w.widgetCodigo === widgetCodigo ? { ...w, visivel: !w.visivel } : w));
    setLayout({ ...layout, widgets });
    await DashboardSuprimentosApi.salvarLayout({ dashboardCodigo: "SUPRIMENTOS", widgets });
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
  }, [idObra, idUnidade, idAlmoxarifado]);

  const widgetsVisiveis = useMemo(() => (layout.widgets || []).filter((w: any) => w.visivel), [layout.widgets]);

  if (!filtros || !resumo) return <div className="p-6">Carregando painel de suprimentos...</div>;

  const obraOptions = filtros.obras || [];
  const unidadeOptions = filtros.unidades || [];
  const almoxOptions = filtros.almoxarifados || [];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">Dashboard Suprimentos</h1>
          <p className="text-sm text-slate-600">Visão de solicitações, estoque e compras com filtros por obra/unidade/almoxarifado.</p>
        </div>

        <div className="flex gap-2 items-center flex-wrap">
          <select
            value={idObra || ""}
            onChange={(e) => {
              const v = Number(e.target.value || 0);
              setIdObra(v ? v : null);
              if (v) {
                setIdUnidade(null);
              }
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
              if (v) {
                setIdObra(null);
              }
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

          <select
            value={idAlmoxarifado || ""}
            onChange={(e) => {
              const v = Number(e.target.value || 0);
              setIdAlmoxarifado(v ? v : null);
            }}
            className="rounded-lg border bg-white px-3 py-2 text-sm"
          >
            <option value="">Todos os almoxarifados</option>
            {almoxOptions.map((a) => (
              <option key={a.id} value={a.id}>
                {a.nome}
              </option>
            ))}
          </select>

          <button className="rounded-lg border px-4 py-2 text-sm" onClick={carregarDados} type="button">
            Atualizar
          </button>
          <DashboardExportButtons
            contexto="SUPRIMENTOS"
            filtros={{ idObra: idObra ?? undefined, idUnidade: idUnidade ?? undefined, idAlmoxarifado: idAlmoxarifado ?? undefined }}
            incluirWidgets={(layout.widgets || []).filter((w: any) => w.visivel).map((w: any) => w.widgetCodigo)}
          />
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
              type="button"
            >
              {w.widgetCodigo}
            </button>
          ))}
        </div>
      </div>

      {widgetsVisiveis.some((w: any) => w.widgetCodigo === "CARDS_SUPRIMENTOS") && (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4 xl:grid-cols-6">
          <Card titulo="Solicitações abertas" valor={resumo.solicitacoesAbertas} />
          <Card titulo="Solicitações urgentes" valor={resumo.solicitacoesUrgentes} destaque="danger" />
          <Card titulo="Aprovações pendentes" valor={resumo.aprovacoesPendentes} destaque="warning" />
          <Card titulo="OCs abertas" valor={resumo.ordensCompraAbertas} />
          <Card titulo="Entregas atrasadas" valor={resumo.entregasAtrasadas} destaque="warning" />
          <Card titulo="Itens abaixo mínimo" valor={resumo.itensAbaixoMinimo} destaque="danger" />
          <Card titulo="Sem giro 60d" valor={resumo.itensSemGiro60d} />
          <Card titulo="Recebimentos pendentes" valor={resumo.recebimentosPendentes} />
          <Card titulo="Divergências receb." valor={resumo.divergenciasRecebimento} destaque="warning" />
          <Card titulo="Compras mês" valor={Number(resumo.valorComprasMes || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} />
          <Card titulo="Recebido mês" valor={Number(resumo.valorRecebidoMes || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} />
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        {widgetsVisiveis.some((w: any) => w.widgetCodigo === "ALERTAS_SUPRIMENTOS") && (
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

        {widgetsVisiveis.some((w: any) => w.widgetCodigo === "SERIES_SUPRIMENTOS") && (
          <section className="rounded-xl border bg-white p-4 shadow-sm">
            <h2 className="mb-3 text-lg font-semibold">Séries dos últimos 6 meses</h2>
            <BlocoSerie titulo="Solicitações" dados={series.map((x) => ({ periodo: x.referencia, total: x.solicitacoes }))} />
          </section>
        )}
      </div>

      {widgetsVisiveis.some((w: any) => w.widgetCodigo === "CONSUMO_POR_OBRA") && (
        <section className="rounded-xl border bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-lg font-semibold">Consumo por Obra (proxy por solicitações)</h2>
          {consumoPorObra.length ? (
            <BlocoSerie
              titulo="Top obras (últimos 90 dias)"
              dados={consumoPorObra.map((x) => ({ periodo: x.nomeObra, total: Number(x.solicitacoes || 0) }))}
            />
          ) : (
            <div className="text-sm text-slate-500">Sem dados suficientes.</div>
          )}
        </section>
      )}

      {widgetsVisiveis.some((w: any) => w.widgetCodigo === "ESTOQUE_CRITICO") && (
        <section className="rounded-xl border bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-lg font-semibold">Estoque crítico</h2>
          {estoqueCritico.length ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-slate-500">
                    <th className="py-2">Item</th>
                    <th className="py-2">Saldo</th>
                    <th className="py-2">Mínimo</th>
                    <th className="py-2">Déficit</th>
                    <th className="py-2">Local</th>
                  </tr>
                </thead>
                <tbody>
                  {estoqueCritico.map((it, i) => (
                    <tr key={i} className="border-t">
                      <td className="py-2">{it.descricao || it.codigo}</td>
                      <td className="py-2">{it.saldoAtual}</td>
                      <td className="py-2">{it.estoqueMinimo}</td>
                      <td className="py-2">{it.deficit}</td>
                      <td className="py-2">
                        {it.tipoLocal} • {it.localNome}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-sm text-slate-500">Sem itens críticos.</div>
          )}
        </section>
      )}

      {widgetsVisiveis.some((w: any) => w.widgetCodigo === "COMPRAS_ANDAMENTO") && (
        <section className="rounded-xl border bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-lg font-semibold">Compras em andamento</h2>
          {comprasAndamento.length ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-slate-500">
                    <th className="py-2">Pedido</th>
                    <th className="py-2">Fornecedor</th>
                    <th className="py-2">Status</th>
                    <th className="py-2">Prevista</th>
                    <th className="py-2">Valor</th>
                    <th className="py-2">Atraso</th>
                  </tr>
                </thead>
                <tbody>
                  {comprasAndamento.map((p, i) => (
                    <tr key={i} className="border-t">
                      <td className="py-2">{p.numeroPedido}</td>
                      <td className="py-2">{p.fornecedorNome}</td>
                      <td className="py-2">{p.status}</td>
                      <td className="py-2">{p.dataPrevistaEntrega ? new Date(p.dataPrevistaEntrega).toLocaleDateString("pt-BR") : "-"}</td>
                      <td className="py-2">
                        {Number(p.valorTotal || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                      </td>
                      <td className="py-2">{p.atrasoDias ? `${p.atrasoDias}d` : "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-sm text-slate-500">Sem compras em andamento.</div>
          )}
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
