"use client";

import { useParams } from "next/navigation";
import LicitacaoDetalheClient from "./licitacaoDetalheClient";

export default function LicitacaoDetalhePage() {
  const params = useParams<{ id: string }>();
  const idLicitacao = Number(params?.id || 0);
  return <LicitacaoDetalheClient idLicitacao={idLicitacao} />;
}

