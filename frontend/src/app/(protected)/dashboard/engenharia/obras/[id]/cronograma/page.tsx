"use client";

import { useParams } from "next/navigation";
import CronogramaObraClient from "./CronogramaObraClient";

export default function CronogramaObraPage() {
  const params = useParams<{ id: string }>();
  const idObra = Number(params?.id || 0);
  return <CronogramaObraClient idObra={idObra} />;
}

