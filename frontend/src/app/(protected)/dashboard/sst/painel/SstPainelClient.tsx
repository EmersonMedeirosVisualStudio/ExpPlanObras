"use client";

import { useEffect, useState } from "react";
import { SstPainelApi } from "@/lib/modules/sst-painel/api";

export default function SstPainelClient() {
  const [resumo, setResumo] = useState<any | null>(null);
  const [alertas, setAlertas] = useState<any[]>([]);
  const [series, setSeries] = useState<any | null>(null);

  async function carregar() {
    const [r, a, s] = await Promise.all([SstPainelApi.resumo(), SstPainelApi.alertas(), SstPainelApi.series()]);
    setResumo(r);
    setAlertas(a);
    setSeries(s);
  }

  useEffect(() => {
    carregar();
  }, []);

  if (!resumo) return <div className="p-6">Carregando painel SST...</div>;

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Painel Gerencial SST</h1>
        <p className="text-sm text-slate-600">Indicadores operacionais e executivos de segurança do trabalho.</p>
      </div>

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
        <Card titulo="Dias sem acidente c/ afast." valor={resumo.diasSemAcidenteComAfastamento ?? "-"} destaque="success" />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
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

        <section className="rounded-xl border bg-white p-4">
          <h2 className="mb-3 text-lg font-semibold">Séries dos últimos 6 meses</h2>

          <BlocoSerie titulo="Acidentes" dados={series?.acidentes || []} />
          <BlocoSerie titulo="Não conformidades" dados={series?.ncs || []} />
          <BlocoSerie titulo="Treinamentos por vencimento" dados={series?.treinamentosVencidos || []} />
        </section>
      </div>
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
  destaque?: "danger" | "warning" | "success";
}) {
  const cls =
    destaque === "danger"
      ? "border-red-200 bg-red-50"
      : destaque === "warning"
        ? "border-amber-200 bg-amber-50"
        : destaque === "success"
          ? "border-emerald-200 bg-emerald-50"
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
