"use client";

import { useParams } from "next/navigation";
import ProgramacaoObraClient from "./programacaoObraClient";

export default function ProgramacaoObraPage() {
  const params = useParams<{ id: string }>();
  const idObra = Number(params?.id || 0);
  return <ProgramacaoObraClient idObra={idObra} />;
}

