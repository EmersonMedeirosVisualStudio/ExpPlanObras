"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function safeInternalPath(path: string | null) {
  const raw = String(path || "").trim();
  if (!raw) return null;
  if (!raw.startsWith("/")) return null;
  if (raw.startsWith("//")) return null;
  if (raw.includes("://")) return null;
  return raw;
}

function parseInternalPath(path: string | null) {
  const safe = safeInternalPath(path);
  if (!safe) return null;
  try {
    const u = new URL(safe, "https://internal.local");
    return { pathname: u.pathname, searchParams: u.searchParams };
  } catch {
    return null;
  }
}

function labelsFromPath(path: string | null) {
  const parsed = parseInternalPath(path);
  if (!parsed?.pathname) return [];
  const parts = parsed.pathname.split("/").filter(Boolean);
  const segs = parts[0] === "dashboard" ? parts.slice(1) : parts;
  const labels: string[] = [];
  const map: Record<string, string> = {
    engenharia: "Engenharia",
    obras: "Obras",
    contratos: "Contratos",
    medicoes: "Medições",
    aditivos: "Aditivos",
    documentos: "Documentos",
    "programacao-financeira": "Programação financeira",
  };
  for (let i = 0; i < segs.length; i++) {
    const seg = String(segs[i] || "");
    const prev = String(segs[i - 1] || "").toLowerCase();
    if (/^\d+$/.test(seg)) {
      if (prev === "obras") labels.push(`Obra #${seg}`);
      else labels.push(`#${seg}`);
      continue;
    }
    const lower = seg.toLowerCase();
    labels.push(map[lower] || (seg.length ? seg[0].toUpperCase() + seg.slice(1) : seg));
  }
  if (parsed.pathname === "/dashboard/contratos") {
    const id = parsed.searchParams.get("id");
    if (id && /^\d+$/.test(id)) labels.push(`Contrato #${id}`);
  }
  return labels.filter(Boolean);
}

export default function ContratosMedicoesPage() {
  const router = useRouter();
  const sp = useSearchParams();
  const contratoId = sp.get("contratoId");
  const returnToParam = safeInternalPath(sp.get("returnTo") || sp.get("from"));
  const returnToStorageKey = "exp:returnTo:contrato-medicoes";
  const [returnToStored, setReturnToStored] = useState<string | null>(null);
  const effectiveReturnTo = returnToParam || returnToStored;

  useEffect(() => {
    try {
      setReturnToStored(safeInternalPath(sessionStorage.getItem(returnToStorageKey)));
    } catch {
      setReturnToStored(null);
    }
  }, []);

  useEffect(() => {
    if (!returnToParam) return;
    try {
      sessionStorage.setItem(returnToStorageKey, returnToParam);
      setReturnToStored(returnToParam);
    } catch {}
  }, [returnToParam]);

  const breadcrumb = useMemo(() => {
    const base = labelsFromPath(effectiveReturnTo);
    const out = base.length ? base.slice() : ["Contratos"];
    if (contratoId && !out.includes(`Contrato #${contratoId}`)) out.push(`Contrato #${contratoId}`);
    out.push("Medições");
    return out.join(" → ");
  }, [contratoId, effectiveReturnTo]);

  const navBtnClass = (active: boolean) =>
    active ? "rounded-lg bg-blue-600 px-3 py-2 text-sm text-white" : "rounded-lg border bg-white px-3 py-2 text-sm hover:bg-slate-50";

  const contratoReturnTo = contratoId ? encodeURIComponent(`/dashboard/contratos?id=${contratoId}`) : "";

  return (
    <div className="p-6 space-y-6 bg-[#f7f8fa] text-slate-900">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="text-xs text-slate-500">{breadcrumb}</div>
          <h1 className="text-2xl font-semibold">Medições</h1>
          <div className="text-sm text-slate-600">Tela em construção.</div>
        </div>
        <button
          className="rounded-lg border bg-white px-3 py-2 text-sm hover:bg-slate-50"
          type="button"
          onClick={() => {
            if (effectiveReturnTo) router.push(effectiveReturnTo);
            else if (contratoId) router.push(`/dashboard/contratos?id=${contratoId}`);
            else router.push("/dashboard/contratos");
          }}
        >
          Voltar
        </button>
      </div>

      {contratoId ? (
        <div className="sticky top-0 z-40 -mx-6 px-6 py-3 bg-[#f7f8fa] border-b border-[#e6edf5]">
          <div className="flex flex-wrap gap-2">
            <button className={navBtnClass(false)} type="button" onClick={() => router.push(`/dashboard/contratos?id=${contratoId}`)}>
              Contrato
            </button>
            <button
              className={navBtnClass(false)}
              type="button"
              onClick={() => {
                const qp = new URLSearchParams();
                qp.set("tipo", "CONTRATO");
                qp.set("id", String(contratoId));
                qp.set("returnTo", `/dashboard/contratos?id=${contratoId}`);
                router.push(`/dashboard/obras/documentos?${qp.toString()}`);
              }}
            >
              Documentos
            </button>
            <button className={navBtnClass(false)} type="button" onClick={() => router.push(`/dashboard/contratos/programacao-financeira?contratoId=${contratoId}&returnTo=${contratoReturnTo}`)}>
              Programação financeira
            </button>
            <button className={navBtnClass(false)} type="button" onClick={() => router.push(`/dashboard/contratos/aditivos?contratoId=${contratoId}&tab=lista&returnTo=${contratoReturnTo}`)}>
              Aditivos
            </button>
            <button className={navBtnClass(true)} type="button">
              Medições
            </button>
            <button className={navBtnClass(false)} type="button" onClick={() => router.push(`/dashboard/contratos/aditivos?contratoId=${contratoId}&tab=eventos&returnTo=${contratoReturnTo}`)}>
              Eventos
            </button>
          </div>
        </div>
      ) : null}
      <div className="rounded-lg border bg-white p-4 text-sm text-slate-700">
        Esta área será usada para listar e gerenciar medições por contrato, com status, workflow e histórico.
      </div>
    </div>
  );
}
