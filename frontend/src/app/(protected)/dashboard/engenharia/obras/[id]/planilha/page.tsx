"use client";

import { useMemo } from "react";
import { useParams, useSearchParams } from "next/navigation";
import PlanilhaObraClient from "./PlanilhaObraClient";

function safeInternalPath(value: string | null | undefined): string | null {
  const s = String(value || "").trim();
  if (!s) return null;
  if (!s.startsWith("/")) return null;
  if (s.startsWith("//")) return null;
  return s;
}

export default function PlanilhaObraPage() {
  const params = useParams<{ id: string }>();
  const sp = useSearchParams();
  const idObra = Number(params?.id || 0);
  const returnTo = useMemo(() => safeInternalPath(sp?.get("returnTo") || null), [sp]);
  return <PlanilhaObraClient idObra={idObra} returnTo={returnTo} />;
}
