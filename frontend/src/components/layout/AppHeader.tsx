"use client";

import type { CurrentUser } from "@/lib/auth/current-user";
import { useMemo } from "react";
import { UserMenu } from "@/components/UserMenu";

export function AppHeader({ user }: { user: CurrentUser }) {
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

  return (
    <header className="flex items-center justify-between border-b bg-white px-6 py-4 text-slate-900">
      <div className="min-w-0">
        <div className="text-lg font-semibold text-slate-900 truncate">{companyName}</div>
      </div>

      <div className="ml-6 flex items-center gap-3">
        <UserMenu />
      </div>
    </header>
  );
}
