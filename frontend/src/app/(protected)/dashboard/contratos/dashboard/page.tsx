"use client";

import { useRouter } from "next/navigation";

export default function ContratosDashboardPage() {
  const router = useRouter();
  return (
    <div className="p-6 space-y-6 max-w-6xl">
      <div>
        <h1 className="text-2xl font-semibold">Contratos → Dashboard</h1>
        <div className="text-sm text-slate-600">Atalhos do módulo de contratos.</div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <button className="rounded-xl border bg-white p-4 shadow-sm text-left hover:bg-slate-50" type="button" onClick={() => router.push("/dashboard/engenharia/contratos-locacao")}>
          <div className="font-semibold">Gestão de Contratos</div>
          <div className="text-sm text-slate-600">Cadastro e acompanhamento dos contratos.</div>
        </button>
        <button className="rounded-xl border bg-white p-4 shadow-sm text-left hover:bg-slate-50" type="button" onClick={() => router.push("/dashboard/obras/documentos?tipo=CONTRATO")}>
          <div className="font-semibold">Documentos do Contrato</div>
          <div className="text-sm text-slate-600">Upload e organização de documentos por contrato.</div>
        </button>
        <button className="rounded-xl border bg-white p-4 shadow-sm text-left hover:bg-slate-50" type="button" onClick={() => router.push("/dashboard/contratos/medicoes")}>
          <div className="font-semibold">Medições (por contrato)</div>
          <div className="text-sm text-slate-600">Central de medições vinculadas ao contrato.</div>
        </button>
        <button className="rounded-xl border bg-white p-4 shadow-sm text-left hover:bg-slate-50" type="button" onClick={() => router.push("/dashboard/contratos/pagamentos")}>
          <div className="font-semibold">Pagamentos</div>
          <div className="text-sm text-slate-600">Conciliação e acompanhamento de pagamentos.</div>
        </button>
      </div>
    </div>
  );
}

