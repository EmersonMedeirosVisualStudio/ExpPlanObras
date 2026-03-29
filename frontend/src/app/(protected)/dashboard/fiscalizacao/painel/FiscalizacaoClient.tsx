"use client";

import { useEffect, useMemo, useState } from "react";

type LayoutDTO = { dashboardCodigo: string; widgets: Array<{ widgetCodigo: string; ordemExibicao: number; largura: number; altura: number; visivel: boolean }> };

function Card({ titulo, valor }: { titulo: string; valor: string | number }) {
  return (
    <div className="rounded-xl border bg-white p-4 shadow-sm">
      <div className="text-xs text-slate-500">{titulo}</div>
      <div className="mt-1 text-xl font-semibold">{valor}</div>
    </div>
  );
}

function Placeholder({ titulo, descricao }: { titulo: string; descricao: string }) {
  return (
    <div className="rounded-xl border bg-white p-4 shadow-sm">
      <div className="text-sm font-medium">{titulo}</div>
      <div className="mt-1 text-sm text-slate-600">{descricao}</div>
    </div>
  );
}

export default function FiscalizacaoClient() {
  const [layout, setLayout] = useState<LayoutDTO>({ dashboardCodigo: "FISCALIZACAO", widgets: [] });
  const [error, setError] = useState<string | null>(null);

  async function carregarLayout() {
    try {
      setError(null);
      const res = await fetch("/api/v1/dashboard/me/layout?contexto=FISCALIZACAO", { cache: "no-store" });
      if (!res.ok) throw new Error("Erro ao carregar layout da Fiscalização.");
      const data = await res.json();
      setLayout(data);
    } catch (e: any) {
      setError(e?.message || "Erro ao carregar layout.");
    }
  }

  async function salvarLayout(next: LayoutDTO) {
    const res = await fetch("/api/v1/dashboard/me/layout", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dashboardCodigo: "FISCALIZACAO", widgets: next.widgets }),
    });
    if (!res.ok) throw new Error("Erro ao salvar layout.");
  }

  async function toggleWidget(widgetCodigo: string) {
    const widgets = (layout.widgets || []).map((w) => (w.widgetCodigo === widgetCodigo ? { ...w, visivel: !w.visivel } : w));
    const next = { ...layout, widgets };
    setLayout(next);
    try {
      await salvarLayout(next);
    } catch (e: any) {
      setError(e?.message || "Erro ao salvar layout.");
    }
  }

  useEffect(() => {
    carregarLayout();
  }, []);

  const widgetsVisiveis = useMemo(() => (layout.widgets || []).filter((w) => w.visivel), [layout.widgets]);

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">Painel Fiscalização</h1>
          <p className="text-sm text-slate-600">Diário de obra, calendário, progresso, medições e prazo.</p>
        </div>

        <div className="rounded-xl border bg-white p-3 shadow-sm">
          <div className="mb-2 text-sm font-medium">Widgets</div>
          <div className="flex flex-wrap gap-2">
            {(layout.widgets || []).map((w) => (
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
      </div>

      {error ? <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}

      {widgetsVisiveis.some((w) => w.widgetCodigo === "CARDS_FISCALIZACAO") && (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4 xl:grid-cols-6">
          <Card titulo="Dias executados" valor={0} />
          <Card titulo="Dias faltando" valor={0} />
          <Card titulo="Dias úteis" valor={0} />
          <Card titulo="Medições" valor={0} />
          <Card titulo="Pendências de campo" valor={0} />
          <Card titulo="Atraso/adiantamento" valor="0d" />
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {widgetsVisiveis.some((w) => w.widgetCodigo === "DIARIO_OBRA") && (
          <Placeholder
            titulo="Diário de obra"
            descricao='Estrutura pronta. Próximo passo: conectar rota de diário com regra "fiscal edita só o bloco da fiscalização".'
          />
        )}
        {widgetsVisiveis.some((w) => w.widgetCodigo === "CALENDARIO_OBRA") && (
          <Placeholder titulo="Calendário da obra" descricao="Estrutura pronta. Próximo passo: eventos, marcos e dias úteis por obra/unidade." />
        )}
        {widgetsVisiveis.some((w) => w.widgetCodigo === "PROGRESSO_OBRA") && (
          <Placeholder titulo="Progresso da obra" descricao="Estrutura pronta. Próximo passo: planejado x executado e séries de avanço." />
        )}
        {widgetsVisiveis.some((w) => w.widgetCodigo === "PROGRESSO_CONTRATO") && (
          <Placeholder titulo="Progresso do contrato" descricao="Estrutura pronta. Próximo passo: resumo do contrato e medições acumuladas." />
        )}
        {widgetsVisiveis.some((w) => w.widgetCodigo === "PRAZO_EXECUCAO") && (
          <Placeholder titulo="Prazo e dias úteis" descricao="Estrutura pronta. Próximo passo: cálculo de prazo (corridos/úteis) e desvio." />
        )}
        {widgetsVisiveis.some((w) => w.widgetCodigo === "MEDICOES_FISCALIZACAO") && (
          <Placeholder titulo="Medições" descricao='Estrutura pronta. Próximo passo: lista e edição apenas no que cabe ao fiscal (status/ocorrências/validações).' />
        )}
      </div>
    </div>
  );
}

