"use client";

import Link from "next/link";

type Props = { slug: string[] };

const KPI = [
  { titulo: "Estoque Total", valor: "R$ 1.250.000", tom: "ok" },
  { titulo: "Itens Críticos", valor: "14", tom: "critico" },
  { titulo: "Compras em Andamento", valor: "9", tom: "atencao" },
  { titulo: "Consumo do Mês", valor: "R$ 380.000", tom: "ok" },
];

const CONSUMO_POR_OBRA = [
  { label: "Obra A", valor: 150000 },
  { label: "Obra B", valor: 100000 },
  { label: "Obra C", valor: 60000 },
];

const CONSUMO_MENSAL = [
  { ref: "Jan", valor: 280000 },
  { ref: "Fev", valor: 310000 },
  { ref: "Mar", valor: 340000 },
  { ref: "Abr", valor: 380000 },
];

function tituloFromSlug(slug: string[]) {
  if (!slug.length) return "Suprimentos";
  const last = slug[slug.length - 1];
  return last
    .split("-")
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" ");
}

function IsDashboard(slug: string[]) {
  return slug.includes("dashboard");
}

export default function SuprimentosHubClient({ slug }: Props) {
  const titulo = tituloFromSlug(slug);
  const isDashboard = IsDashboard(slug);
  const maxObra = Math.max(...CONSUMO_POR_OBRA.map((x) => x.valor), 1);
  const maxMensal = Math.max(...CONSUMO_MENSAL.map((x) => x.valor), 1);

  return (
    <div className="p-6 space-y-6 text-slate-900">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Suprimentos — {titulo}</h1>
          <p className="text-sm text-slate-600">Módulo estruturado por contexto: Central, Obra, Unidade de Estoque, Unidade de Venda e Logística.</p>
        </div>
        <Link href="/dashboard/suprimentos/painel" className="rounded-lg border bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">
          Abrir Painel Operacional
        </Link>
      </div>

      {isDashboard ? (
        <>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {KPI.map((k) => (
              <div
                key={k.titulo}
                className={`rounded-xl border p-4 shadow-sm ${
                  k.tom === "critico" ? "border-red-200 bg-red-50" : k.tom === "atencao" ? "border-amber-200 bg-amber-50" : "border-slate-200 bg-white"
                }`}
              >
                <div className="text-xs text-slate-500">{k.titulo}</div>
                <div className="mt-1 text-2xl font-semibold">{k.valor}</div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            <section className="rounded-xl border bg-white p-4 shadow-sm">
              <h2 className="mb-3 text-lg font-semibold">Consumo por Obra</h2>
              <div className="space-y-3">
                {CONSUMO_POR_OBRA.map((i) => (
                  <div key={i.label}>
                    <div className="mb-1 flex justify-between text-sm">
                      <span>{i.label}</span>
                      <span>{i.valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</span>
                    </div>
                    <div className="h-3 rounded bg-slate-100">
                      <div className="h-3 rounded bg-blue-600" style={{ width: `${(i.valor / maxObra) * 100}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-xl border bg-white p-4 shadow-sm">
              <h2 className="mb-3 text-lg font-semibold">Consumo no Tempo</h2>
              <div className="space-y-3">
                {CONSUMO_MENSAL.map((i) => (
                  <div key={i.ref}>
                    <div className="mb-1 flex justify-between text-sm">
                      <span>{i.ref}</span>
                      <span>{i.valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</span>
                    </div>
                    <div className="h-3 rounded bg-slate-100">
                      <div className="h-3 rounded bg-emerald-600" style={{ width: `${(i.valor / maxMensal) * 100}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </>
      ) : (
        <section className="rounded-xl border bg-white p-4 shadow-sm">
          <div className="text-sm text-slate-600">
            Esta área está estruturada no menu e pronta para implantação gradual com permissões, workflow e indicadores.
          </div>
          <div className="mt-2 text-xs text-slate-500">Próximos passos: listar dados reais, filtros por contexto e ações transacionais do módulo.</div>
        </section>
      )}
    </div>
  );
}

