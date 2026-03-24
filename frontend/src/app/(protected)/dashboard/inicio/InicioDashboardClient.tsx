"use client";

import { useEffect, useMemo, useState } from "react";
import { HomeApi } from "@/lib/home/api";
import type { DashboardHomeDTO, HomeWidgetDTO } from "@/lib/home/types";

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border bg-white p-4 shadow-sm">
      <h2 className="mb-3 text-lg font-semibold">{title}</h2>
      {children}
    </section>
  );
}

export default function InicioDashboardClient() {
  const [data, setData] = useState<DashboardHomeDTO | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function carregar() {
    try {
      setError(null);
      const d = await HomeApi.obterHome();
      setData(d);
    } catch (e: any) {
      setError(e?.message || "Erro ao carregar home.");
    }
  }

  useEffect(() => {
    carregar();
  }, []);

  if (!data) return <div className="p-6">Carregando sua página inicial...</div>;

  const widgets = data.widgets || [];
  const porChave = (k: string) => widgets.find((w) => w.widgetKey === k);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Início</h1>
          <p className="text-sm text-slate-600">Página inicial personalizada.</p>
        </div>
        <div className="flex gap-2">
          <button className="rounded-lg border px-4 py-2 text-sm" onClick={carregar} type="button">
            Atualizar
          </button>
        </div>
      </div>

      {error ? <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}

      {porChave("BEM_VINDO") ? (
        <Card title="Bem-vindo">{porChave("BEM_VINDO")?.dados ? <div>Olá, {(porChave("BEM_VINDO")!.dados as any).nome}!</div> : null}</Card>
      ) : null}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        {porChave("ATALHOS_RAPIDOS") ? (
          <Card title="Atalhos rápidos">
            <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
              {(porChave("ATALHOS_RAPIDOS")!.dados as any[]).map((a, i) => (
                <a key={i} href={a.href || (a.menuKey || "#")} className="rounded-lg border px-3 py-2 text-sm hover:bg-slate-50">
                  {a.titulo}
                </a>
              ))}
            </div>
          </Card>
        ) : null}
        {porChave("PENDENCIAS_MODULOS") ? (
          <Card title="Pendências por módulo">
            <div className="space-y-2">
              {(porChave("PENDENCIAS_MODULOS")!.dados as any[]).map((p, i) => (
                <div key={i} className="flex items-center justify-between rounded border px-3 py-2 text-sm">
                  <div>{p.label || p.key}</div>
                  <div className="font-semibold">{p.value}</div>
                </div>
              ))}
            </div>
          </Card>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        {porChave("NOTIFICACOES") ? (
          <Card title="Notificações recentes">
            <div className="space-y-2">
              {(porChave("NOTIFICACOES")!.dados as any[]).map((n, i) => (
                <div key={i} className={`rounded border p-3 ${n.lida ? "bg-white" : "bg-blue-50"}`}>
                  <div className="text-xs text-slate-500">{n.modulo}</div>
                  <div className="font-medium">{n.titulo}</div>
                  <div className="text-sm text-slate-600">{n.mensagem}</div>
                </div>
              ))}
            </div>
          </Card>
        ) : null}

        {porChave("FAVORITOS") ? (
          <Card title="Favoritos">
            <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
              {(porChave("FAVORITOS")!.dados as any[]).map((f, i) => (
                <a key={i} href={f.href || "#"} className="rounded-lg border px-3 py-2 text-sm hover:bg-slate-50">
                  {f.label || f.menuKey}
                </a>
              ))}
            </div>
          </Card>
        ) : null}
      </div>
    </div>
  );
}

