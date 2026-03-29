"use client";

import { useParams } from "next/navigation";
import ApropriacaoObraClient from "./ApropriacaoObraClient";

export default function ApropriacaoObraPage() {
  const params = useParams<{ id: string }>();
  const idObra = Number(params?.id || 0);
  return <ApropriacaoObraClient idObra={idObra} />;
}

