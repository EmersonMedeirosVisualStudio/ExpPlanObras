"use client";

import { useParams } from "next/navigation";
import PlanilhaObraClient from "./PlanilhaObraClient";

export default function PlanilhaObraPage() {
  const params = useParams<{ id: string }>();
  const idObra = Number(params?.id || 0);
  return <PlanilhaObraClient idObra={idObra} />;
}

