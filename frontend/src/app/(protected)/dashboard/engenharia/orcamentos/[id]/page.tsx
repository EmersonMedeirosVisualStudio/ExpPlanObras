"use client";

import { useParams } from "next/navigation";
import OrcamentoDetalheClient from "./orcamentoDetalheClient";

export default function OrcamentoDetalhePage() {
  const params = useParams<{ id: string }>();
  const idOrcamento = Number(params?.id || 0);
  return <OrcamentoDetalheClient idOrcamento={idOrcamento} />;
}

