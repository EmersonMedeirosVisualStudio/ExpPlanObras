"use client";

import { useRouter, useSearchParams } from "next/navigation";

export default function ContratosMedicoesPage() {
  const router = useRouter();
  const sp = useSearchParams();
  const contratoId = sp.get("contratoId");
  const returnTo = sp.get("returnTo");

  return (
    <div className="p-6 space-y-4 max-w-4xl">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">Contratos → Medições</h1>
          <div className="text-sm text-slate-600">Tela em construção.</div>
        </div>
        <button
          className="rounded-lg border bg-white px-3 py-2 text-sm hover:bg-slate-50"
          type="button"
          onClick={() => {
            if (returnTo) router.push(returnTo);
            else if (contratoId) router.push(`/dashboard/contratos?id=${contratoId}`);
            else router.push("/dashboard/contratos");
          }}
        >
          {contratoId || returnTo ? "Voltar ao contrato" : "Voltar para Contratos"}
        </button>
      </div>
      <div className="rounded-lg border bg-white p-4 text-sm text-slate-700">
        Esta área será usada para listar e gerenciar medições por contrato, com status, workflow e histórico.
      </div>
    </div>
  );
}
