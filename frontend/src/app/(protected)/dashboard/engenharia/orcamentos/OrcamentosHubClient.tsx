"use client";

import { useMemo, useState } from "react";
import ServicosClient from "../servicos/ServicosClient";
import InsumosClient from "../insumos/InsumosClient";
import ComposicoesClient from "../composicoes/ComposicoesClient";
import OrcamentosClient from "./OrcamentosClient";

export default function OrcamentosHubClient() {
  const [tab, setTab] = useState<"ORCAMENTOS" | "SERVICOS" | "INSUMOS" | "COMPOSICOES">("ORCAMENTOS");

  const titulo = useMemo(() => {
    if (tab === "ORCAMENTOS") return "Criação e gestão de orçamentos (licitação/contrato privado), com versões e parâmetros próprios.";
    if (tab === "SERVICOS") return "Base corporativa: serviços (SINAPI/código interno).";
    if (tab === "INSUMOS") return "Base corporativa: insumos (materiais, mão de obra, equipamentos).";
    return "Base corporativa: composições (CC por insumo e etapa).";
  }, [tab]);

  return (
    <div className="p-6 space-y-6 max-w-7xl">
      <div>
        <h1 className="text-2xl font-semibold">Engenharia → Orçamentos</h1>
        <div className="text-sm text-slate-600">{titulo}</div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button className={`rounded-lg border px-4 py-2 text-sm ${tab === "ORCAMENTOS" ? "bg-blue-50 border-blue-200" : ""}`} type="button" onClick={() => setTab("ORCAMENTOS")}>
          Orçamentos
        </button>
        <button className={`rounded-lg border px-4 py-2 text-sm ${tab === "SERVICOS" ? "bg-blue-50 border-blue-200" : ""}`} type="button" onClick={() => setTab("SERVICOS")}>
          Serviços
        </button>
        <button className={`rounded-lg border px-4 py-2 text-sm ${tab === "INSUMOS" ? "bg-blue-50 border-blue-200" : ""}`} type="button" onClick={() => setTab("INSUMOS")}>
          Insumos
        </button>
        <button className={`rounded-lg border px-4 py-2 text-sm ${tab === "COMPOSICOES" ? "bg-blue-50 border-blue-200" : ""}`} type="button" onClick={() => setTab("COMPOSICOES")}>
          Composições
        </button>
      </div>

      {tab === "ORCAMENTOS" ? <OrcamentosClient /> : null}
      {tab === "SERVICOS" ? <ServicosClient /> : null}
      {tab === "INSUMOS" ? <InsumosClient /> : null}
      {tab === "COMPOSICOES" ? <ComposicoesClient /> : null}
    </div>
  );
}

