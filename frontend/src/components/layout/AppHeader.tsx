"use client";

import type { CurrentUser } from "@/lib/auth/current-user";
import { useMemo, useState } from "react";
import { UserMenu } from "@/components/UserMenu";
import { NotificationBell } from "@/components/layout/NotificationBell";
import { GlobalSearchTrigger } from "@/components/search/GlobalSearchTrigger";

function formatProfileLabel(profile: string) {
  if (profile === "REPRESENTANTE_EMPRESA") return "Representante";
  if (profile === "ENCARREGADO_SISTEMA_EMPRESA") return "Encarregado do Sistema";
  if (profile === "CEO") return "CEO";
  if (profile === "SYSTEM_ADMIN") return "Administrador da Plataforma";
  return profile;
}

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
  const [activeProfile, setActiveProfile] = useState(() => {
    const stored = safeGet("active_profile") || "";
    if (stored && user.perfis.includes(stored as any)) return stored;
    if (user.perfis.includes("REPRESENTANTE_EMPRESA" as any)) return "REPRESENTANTE_EMPRESA";
    return user.perfis[0] || "";
  });
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
                  {formatProfileLabel(p)}
                </option>
              ))}
            </select>
          </label>
          <div className="flex items-center gap-2">
            <span>Contexto</span>
            <div className="inline-flex overflow-hidden rounded-lg border border-slate-200">
              <button
                type="button"
                onClick={() => onContextChange("EMPRESA")}
                className={`px-3 py-1 text-sm ${
                  activeContext === "EMPRESA" ? "bg-blue-600 text-white" : "bg-white text-slate-700 hover:bg-slate-50"
                }`}
              >
                Empresa
              </button>
              <button
                type="button"
                onClick={() => onContextChange("OBRA")}
                className={`px-3 py-1 text-sm ${
                  activeContext === "OBRA" ? "bg-blue-600 text-white" : "bg-white text-slate-700 hover:bg-slate-50"
                }`}
              >
                Obra
              </button>
              <button
                type="button"
                onClick={() => onContextChange("UNIDADE")}
                className={`px-3 py-1 text-sm ${
                  activeContext === "UNIDADE" ? "bg-blue-600 text-white" : "bg-white text-slate-700 hover:bg-slate-50"
                }`}
              >
                Unidade
              </button>
            </div>
          </div>
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
