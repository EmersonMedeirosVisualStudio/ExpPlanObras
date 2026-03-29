"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import ProgramacaoSemanalClient from "@/app/(protected)/dashboard/engenharia/programacao-semanal/ProgramacaoSemanalClient";
import ProgramacaoEquipamentosClient from "./programacaoEquipamentosClient";
import ProgramacaoInsumosClient from "./programacaoInsumosClient";

export default function ProgramacaoObraClient({ idObra }: { idObra: number }) {
  const router = useRouter();
  const [tab, setTab] = useState<"MAO_OBRA" | "EQUIPAMENTOS" | "INSUMOS">("MAO_OBRA");
  const [planilhaOk, setPlanilhaOk] = useState<boolean | null>(null);

  const titulo = useMemo(() => {
    if (tab === "MAO_OBRA") return "Programação semanal — Mão de obra";
    if (tab === "EQUIPAMENTOS") return "Programação semanal — Equipamentos";
    return "Programação semanal — Insumos";
  }, [tab]);

  if (!idObra) {
    return (
      <div className="p-6 max-w-4xl">
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">Obra inválida.</div>
      </div>
    );
  }

  useEffect(() => {
    async function check() {
      try {
        const res = await fetch(`/api/v1/engenharia/obras/${idObra}/planilha/status`, { cache: "no-store" });
        const json = await res.json().catch(() => null);
        if (!res.ok || !json?.success) throw new Error();
        setPlanilhaOk(!!json.data?.possuiPlanilha);
      } catch {
        setPlanilhaOk(false);
      }
    }
    check();
  }, [idObra]);

  if (planilhaOk === false) {
    return (
      <div className="p-6 space-y-4 max-w-5xl">
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <div className="font-semibold text-amber-900">A obra só pode iniciar após cadastrar a planilha orçamentária</div>
          <div className="mt-1 text-sm text-amber-900">Cadastre a planilha contratada da obra e selecione os centros de custo por serviço. Depois disso, a programação semanal será liberada.</div>
        </div>
        <button className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white" type="button" onClick={() => router.push(`/dashboard/engenharia/obras/${idObra}/planilha`)}>
          Abrir planilha contratada
        </button>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl">
      <div>
        <h1 className="text-2xl font-semibold">Obra #{idObra}</h1>
        <div className="text-sm text-slate-600">{titulo}</div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button className={`rounded-lg px-3 py-2 text-sm ${tab === "MAO_OBRA" ? "bg-blue-600 text-white" : "bg-white border"}`} type="button" onClick={() => setTab("MAO_OBRA")}>
          Mão de obra
        </button>
        <button
          className={`rounded-lg px-3 py-2 text-sm ${tab === "EQUIPAMENTOS" ? "bg-blue-600 text-white" : "bg-white border"}`}
          type="button"
          onClick={() => setTab("EQUIPAMENTOS")}
        >
          Equipamentos
        </button>
        <button className={`rounded-lg px-3 py-2 text-sm ${tab === "INSUMOS" ? "bg-blue-600 text-white" : "bg-white border"}`} type="button" onClick={() => setTab("INSUMOS")}>
          Insumos
        </button>
      </div>

      {tab === "MAO_OBRA" ? <ProgramacaoSemanalClient idObraFixed={idObra} /> : null}
      {tab === "EQUIPAMENTOS" ? <ProgramacaoEquipamentosClient idObra={idObra} /> : null}
      {tab === "INSUMOS" ? <ProgramacaoInsumosClient idObra={idObra} /> : null}
    </div>
  );
}
