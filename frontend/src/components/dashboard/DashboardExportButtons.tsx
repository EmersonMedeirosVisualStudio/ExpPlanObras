"use client";

import { useState } from "react";
import { DashboardExportApi } from "@/lib/modules/dashboard-export/api";
import type { DashboardExportContexto, DashboardExportFiltrosDTO } from "@/lib/modules/dashboard-export/types";

type Props = {
  contexto: DashboardExportContexto;
  filtros?: DashboardExportFiltrosDTO;
  incluirWidgets?: string[];
};

export function DashboardExportButtons({ contexto, filtros, incluirWidgets }: Props) {
  const [loading, setLoading] = useState<"PDF" | "XLSX" | null>(null);

  async function baixar(formato: "PDF" | "XLSX") {
    try {
      setLoading(formato);
      await DashboardExportApi.baixar({
        contexto,
        formato,
        filtros,
        incluirWidgets,
      });
    } catch (e: any) {
      alert(e?.message || "Erro ao exportar");
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="flex gap-2">
      <button className="rounded-lg border px-3 py-2 text-sm" onClick={() => baixar("PDF")} disabled={!!loading}>
        {loading === "PDF" ? "Gerando PDF..." : "Exportar PDF"}
      </button>
      <button className="rounded-lg border px-3 py-2 text-sm" onClick={() => baixar("XLSX")} disabled={!!loading}>
        {loading === "XLSX" ? "Gerando Excel..." : "Exportar Excel"}
      </button>
    </div>
  );
}

