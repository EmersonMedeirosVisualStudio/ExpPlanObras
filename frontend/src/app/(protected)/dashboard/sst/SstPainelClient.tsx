"use client";

import { useEffect, useMemo, useState } from "react";
import { SstPainelApi } from "@/lib/modules/sst-painel/api";

function getCookieValue(name: string): string | null {
  if (typeof document === "undefined") return null;
  const parts = document.cookie.split(";").map((x) => x.trim());
  const hit = parts.find((p) => p.startsWith(`${name}=`));
  if (!hit) return null;
  return hit.slice(name.length + 1);
}

function hasExecutivoPermission(): boolean {
  try {
    const raw = getCookieValue("exp_user");
    if (!raw) return false;
    const decoded = decodeURIComponent(raw);
    const user = JSON.parse(decoded) as { permissoes?: string[] };
    return Array.isArray(user.permissoes) && user.permissoes.includes("sst.painel.executivo.view");
  } catch {
    return false;
  }
}

function Card({ title, value }: { title: string; value: string | number }) {
  return (
    <div className="rounded-xl border bg-white p-4">
      <div className="text-xs uppercase tracking-wide text-slate-500">{title}</div>
      <div className="mt-2 text-2xl font-semibold text-slate-900">{value}</div>
    </div>
  );
}

export default function SstPainelClient() {
  const [resumo, setResumo] = useState<any | null>(null);
  const [alertas, setAlertas] = useState<any[]>([]);
  const [series, setSeries] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [executivo, setExecutivo] = useState(false);

  async function carregar() {
    setLoading(true);
    try {
      setError(null);
      const [r, a, s] = await Promise.all([SstPainelApi.resumo(), SstPainelApi.alertas(), SstPainelApi.series()]);
      setResumo(r);
      setAlertas(a);
      setSeries(s);
    } catch (e: any) {
      setError(e?.message || "Erro ao carregar painel.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setExecutivo(hasExecutivoPermission());
    carregar();
  }, []);

  const diasSemAfastamentoLabel = useMemo(() => {
    const v = resumo?.diasSemAcidenteComAfastamento;
    if (v === null || v === undefined) return "-";
    return `${Number(v)} dias`;
  }, [resumo?.diasSemAcidenteComAfastamento]);

  if (loading) return <div className="p-6 rounded-xl border bg-white">Carregando painel SST...</div>;

  return (
    <div className="p-6 space-y-6 max-w-7xl">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">Painel Gerencial SST</h1>
          <p className="text-sm text-slate-600">Indicadores consolidados (NC, acidentes, treinamentos, EPI e checklists).</p>
        </div>
        <button onClick={carregar} className="rounded-lg border px-4 py-2 text-sm" type="button">
          Atualizar
        </button>
      </div>

      {error ? <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
        <Card title="NCs abertas" value={resumo?.ncAbertas ?? 0} />
        <Card title="NCs vencidas" value={resumo?.ncVencidas ?? 0} />
        <Card title="Acidentes no mês" value={resumo?.acidentesMes ?? 0} />
        <Card title="CATs pendentes" value={resumo?.catPendentes ?? 0} />
        <Card title="Trein. vencidos" value={resumo?.treinamentosVencidos ?? 0} />
        <Card title="Trein. em alerta" value={resumo?.treinamentosAlerta ?? 0} />
        <Card title="EPI troca vencida" value={resumo?.epiTrocaPendente ?? 0} />
        <Card title="EPI CA vencido" value={resumo?.epiCaVencido ?? 0} />
        <Card title="Checklists pendentes" value={resumo?.checklistsPendentes ?? 0} />
        <Card title="Checklists atrasados" value={resumo?.checklistsAtrasados ?? 0} />
        <Card title="Dias sem afastamento" value={diasSemAfastamentoLabel} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="rounded-xl border bg-white p-4">
          <h2 className="mb-3 font-semibold">Alertas</h2>
          <div className="space-y-2">
            {alertas.length ? (
              alertas.map((a: any, idx: number) => (
                <div key={`${a.tipo}-${a.referenciaId}-${idx}`} className="rounded border p-3 text-sm">
                  <div className="font-medium">{a.titulo}</div>
                  <div className="text-slate-500">{a.subtitulo}</div>
                </div>
              ))
            ) : (
              <div className="text-sm text-slate-500">Nenhum alerta.</div>
            )}
          </div>
        </section>

        <section className="rounded-xl border bg-white p-4">
          <h2 className="mb-3 font-semibold">Acesso rápido</h2>
          <div className="space-y-2 text-sm">
            <div className="rounded border p-3">
              <div className="font-medium">NCs</div>
              <div className="text-slate-500">Ver e tratar não conformidades.</div>
            </div>
            <div className="rounded border p-3">
              <div className="font-medium">Acidentes</div>
              <div className="text-slate-500">Registrar e investigar ocorrências.</div>
            </div>
            <div className="rounded border p-3">
              <div className="font-medium">EPI</div>
              <div className="text-slate-500">Fichas, itens e inspeções.</div>
            </div>
            <div className="rounded border p-3">
              <div className="font-medium">Treinamentos</div>
              <div className="text-slate-500">Turmas e vencimentos.</div>
            </div>
          </div>
        </section>
      </div>

      {executivo ? (
        <section className="rounded-xl border bg-white p-4">
          <h2 className="mb-3 font-semibold">Séries (últimos 6 meses)</h2>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div className="rounded border p-3 text-sm">
              <div className="font-semibold">Acidentes por mês</div>
              <div className="mt-2 space-y-1 text-slate-600">
                {series?.acidentes?.length ? series.acidentes.map((x: any) => <div key={x.periodo}>{x.periodo}: {x.total}</div>) : <div>-</div>}
              </div>
            </div>
            <div className="rounded border p-3 text-sm">
              <div className="font-semibold">NCs por mês</div>
              <div className="mt-2 space-y-1 text-slate-600">
                {series?.ncs?.length ? series.ncs.map((x: any) => <div key={x.periodo}>{x.periodo}: {x.total}</div>) : <div>-</div>}
              </div>
            </div>
            <div className="rounded border p-3 text-sm">
              <div className="font-semibold">Vencimentos de treinamento</div>
              <div className="mt-2 space-y-1 text-slate-600">
                {series?.treinamentosVencidos?.length ? series.treinamentosVencidos.map((x: any) => <div key={x.periodo}>{x.periodo}: {x.total}</div>) : <div>-</div>}
              </div>
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}
