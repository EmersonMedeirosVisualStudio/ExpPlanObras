"use client";

import type { ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { CurrentUser } from "@/lib/auth/current-user";
import type { Permission } from "@/lib/auth/permissions";

type Props = {
  user: CurrentUser;
  permissions: Permission[];
  children: ReactNode;
  fallback?: ReactNode;
};

export function RouteGuard({ user, permissions, children, fallback }: Props) {
  const pathname = usePathname();
  const router = useRouter();

  const allowed = user.permissoes.includes("*") || permissions.some((p) => user.permissoes.includes(p));

  if (!allowed) {
    if (fallback) return <>{fallback}</>;
    if (typeof window !== "undefined") router.replace("/dashboard/403");
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">
        Acesso negado para {pathname}.
      </div>
    );
  }

  return <>{children}</>;
}
