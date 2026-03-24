"use client";

import type { CurrentUser } from "@/lib/auth/current-user";
import { useMemo, useState } from "react";
import { UserMenu } from "@/components/UserMenu";
import { NotificationBell } from "@/components/layout/NotificationBell";

function safeGet(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
  }
}

export function AppHeader({ user }: { user: CurrentUser }) {
  const [activeProfile, setActiveProfile] = useState(() => safeGet("active_profile") || user.perfis[0] || "");
  const [activeContext, setActiveContext] = useState<"EMPRESA" | "OBRA" | "UNIDADE">(() => {
    const v = safeGet("active_context");
    if (v === "OBRA" || v === "UNIDADE") return v;
    return "EMPRESA";
  });

  const companyName = useMemo(() => {
    const u = safeGet("user");
    if (!u) return `Empresa #${user.tenantId}`;
    try {
      const parsed: unknown = JSON.parse(u);
      const obj = typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : null;
      const tenants = obj ? obj['tenants'] : null;
      if (Array.isArray(tenants) && tenants.length > 0) {
        const first = typeof tenants[0] === 'object' && tenants[0] !== null ? (tenants[0] as Record<string, unknown>) : null;
        return String((first && first['name']) || `Empresa #${user.tenantId}`);
      }
    } catch {
    }
    return `Empresa #${user.tenantId}`;
  }, [user.tenantId]);

  const onProfileChange = (p: string) => {
    setActiveProfile(p);
    safeSet("active_profile", p);
  };

  const onContextChange = (ctx: "EMPRESA" | "OBRA" | "UNIDADE") => {
    setActiveContext(ctx);
    safeSet("active_context", ctx);
  };

  return (
    <header className="flex items-center justify-between border-b bg-white px-6 py-4">
      <div className="min-w-0">
        <h1 className="text-lg font-semibold truncate">{companyName}</h1>
        <div className="mt-1 flex flex-wrap items-center gap-3 text-sm text-gray-600">
          <div className="text-gray-700">{user.nome}</div>
          <div className="text-gray-400">•</div>
          <div className="text-gray-600">{user.email}</div>
          <div className="text-gray-400">•</div>
          <label className="flex items-center gap-2">
            <span>Perfil</span>
            <select value={activeProfile} onChange={(e) => onProfileChange(e.target.value)} className="border rounded px-2 py-1 text-sm">
              {user.perfis.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2">
            <span>Contexto</span>
            <select
              value={activeContext}
              onChange={(e) => {
                const v = e.target.value;
                if (v === "EMPRESA" || v === "OBRA" || v === "UNIDADE") onContextChange(v);
              }}
              className="border rounded px-2 py-1 text-sm"
            >
              <option value="EMPRESA">Empresa</option>
              <option value="OBRA">Obra</option>
              <option value="UNIDADE">Unidade</option>
            </select>
          </label>
        </div>
      </div>

      <div className="ml-6 flex items-center gap-3">
        <NotificationBell />
        <UserMenu />
      </div>
    </header>
  );
}
