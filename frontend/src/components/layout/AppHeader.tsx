"use client";

import type { CurrentUser } from "@/lib/auth/current-user";
import { useEffect, useMemo, useState } from "react";
import { UserMenu } from "@/components/UserMenu";
import { NotificationBell } from "@/components/layout/NotificationBell";
import { GlobalSearchTrigger } from "@/components/search/GlobalSearchTrigger";
import { getActiveObra, setActiveObra, subscribeActiveObra, type ActiveObra } from "@/lib/obra/active";
import { useRouter } from "next/navigation";

export function AppHeader({ user }: { user: CurrentUser }) {
  const router = useRouter();
  const companyName = useMemo(() => {
    try {
      const raw = localStorage.getItem("user");
      if (!raw) return `Empresa #${user.tenantId}`;
      const parsed: unknown = JSON.parse(raw);
      const obj = typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : null;
      const tenants = obj ? obj["tenants"] : null;
      if (Array.isArray(tenants) && tenants.length > 0) {
        const first = typeof tenants[0] === "object" && tenants[0] !== null ? (tenants[0] as Record<string, unknown>) : null;
        const name = first && first["name"] ? String(first["name"]) : "";
        if (name.trim()) return name.trim();
      }
    } catch {}
    return `Empresa #${user.tenantId}`;
  }, [user.tenantId]);

  const [obras, setObras] = useState<{ id: number; nome: string }[]>([]);
  const [activeObra, setActiveObraState] = useState<ActiveObra | null>(() => getActiveObra());

  useEffect(() => subscribeActiveObra(() => setActiveObraState(getActiveObra())), []);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch("/api/v1/dashboard/me/filtros", { cache: "no-store" });
        const json = await res.json().catch(() => null);
        if (!res.ok || !json?.success) return;
        const lista = Array.isArray(json.data?.obras) ? (json.data.obras as any[]) : [];
        const norm = lista.map((o) => ({ id: Number(o.id), nome: String(o.nome || `Obra #${o.id}`) }));
        if (!active) return;
        setObras(norm);
      } catch {}
    })();
    return () => {
      active = false;
    };
  }, []);

  const activeObraLabel = useMemo(() => {
    if (!activeObra?.id) return null;
    const fromList = obras.find((o) => o.id === activeObra.id)?.nome;
    const nome = fromList || activeObra.nome || `Obra #${activeObra.id}`;
    return `Obra: ${nome}`;
  }, [activeObra, obras]);

  return (
    <header className="flex items-center justify-between border-b bg-white px-6 py-4">
      <div className="min-w-0">
        <div className="text-lg font-semibold text-slate-900 truncate">{companyName}</div>
        <div className="mt-1 flex items-center gap-2">
          <span className="text-xs font-semibold uppercase text-slate-500">Obra ativa</span>
          <select
            className="h-8 rounded-md border bg-white px-2 text-sm text-slate-700"
            value={activeObra?.id || ""}
            onChange={(e) => {
              const id = Number(e.target.value || 0);
              if (!id) {
                setActiveObra(null);
                return;
              }
              const nome = obras.find((o) => o.id === id)?.nome;
              setActiveObra({ id, nome });
              router.push(`/dashboard/engenharia/obras/${id}`);
            }}
          >
            <option value="">Selecionar…</option>
            {obras.map((o) => (
              <option key={o.id} value={o.id}>
                {o.nome}
              </option>
            ))}
          </select>
          {activeObraLabel ? <span className="text-xs text-slate-500 truncate">{activeObraLabel}</span> : null}
        </div>
      </div>

      <div className="ml-6 flex items-center gap-3">
        <GlobalSearchTrigger />
        <NotificationBell />
        <UserMenu />
      </div>
    </header>
  );
}
