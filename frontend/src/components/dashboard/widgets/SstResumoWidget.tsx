"use client";

import { useEffect, useState } from "react";
import { SstPainelApi } from "@/lib/modules/sst-painel/api";

export default function SstResumoWidget() {
  const [resumo, setResumo] = useState<any | null>(null);

  useEffect(() => {
    SstPainelApi.resumo().then(setResumo).catch(() => setResumo(null));
  }, []);

  if (!resumo) {
    return <div className="rounded-xl border bg-white p-4">Carregando SST...</div>;
  }

  return (
    <div className="rounded-xl border bg-white p-4 shadow-sm">
      <div className="mb-3 text-lg font-semibold">Resumo SST</div>
      <div className="grid grid-cols-2 gap-3 text-sm">
        <Mini label="NC vencidas" value={resumo.ncVencidas} danger />
        <Mini label="CAT pendentes" value={resumo.catPendentes} danger />
        <Mini label="Acidentes mês" value={resumo.acidentesMes} />
        <Mini label="Trein. vencidos" value={resumo.treinamentosVencidos} />
        <Mini label="Checklist atrasado" value={resumo.checklistsAtrasados} />
        <Mini label="Dias sem afastamento" value={resumo.diasSemAcidenteComAfastamento ?? "-"} />
      </div>
    </div>
  );
}

function Mini({ label, value, danger }: { label: string; value: string | number; danger?: boolean }) {
  return (
    <div className={`rounded-lg border p-3 ${danger ? "border-red-200 bg-red-50" : "border-slate-200 bg-slate-50"}`}>
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-1 text-lg font-semibold">{value}</div>
    </div>
  );
}

