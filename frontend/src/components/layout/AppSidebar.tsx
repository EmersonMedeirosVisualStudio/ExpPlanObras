"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MENU_ITEMS, filterMenuByPermission } from "@/lib/navigation/menu";
import type { CurrentUser } from "@/lib/auth/current-user";
import { useMemo, useState } from "react";

export function AppSidebar({ user }: { user: CurrentUser }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});

  const menu = useMemo(() => filterMenuByPermission(MENU_ITEMS, user), [user]);

  return (
    <aside className={`border-r bg-white ${collapsed ? "w-16" : "w-72"} transition-all`}>
      <div className="p-4">
        <div className="flex items-center justify-between mb-4">
          {collapsed ? null : <div className="text-xl font-bold">ExpPlanObras</div>}
          <button
            type="button"
            onClick={() => setCollapsed((v) => !v)}
            className="px-2 py-1 border rounded text-gray-700 hover:bg-gray-50"
            title="Colapsar/expandir"
          >
            {collapsed ? "»" : "«"}
          </button>
        </div>

        <nav className="space-y-2">
          {menu.map((item) => {
            if (item.path) {
              const active = pathname === item.path;
              return (
                <Link
                  key={item.label}
                  href={item.path}
                  className={`block rounded px-3 py-2 text-sm ${
                    active ? "bg-blue-100 font-semibold text-blue-700" : "hover:bg-gray-100"
                  }`}
                  title={item.label}
                >
                  {collapsed ? item.label.charAt(0) : item.label}
                </Link>
              );
            }

            const open = Boolean(openGroups[item.label]);
            return (
              <div key={item.label} className="space-y-1">
                <button
                  type="button"
                  onClick={() => setOpenGroups((p) => ({ ...p, [item.label]: !open }))}
                  className="w-full text-left px-3 py-2 text-xs font-semibold uppercase text-gray-500 hover:bg-gray-50 rounded"
                  title={item.label}
                >
                  {collapsed ? item.label.charAt(0) : item.label}
                </button>
                {open && !collapsed && (
                  <div className="space-y-1">
                    {item.children?.map((child) => {
                      const active = pathname === child.path;
                      return (
                        <Link
                          key={child.label}
                          href={child.path!}
                          className={`ml-2 block rounded px-3 py-2 text-sm ${
                            active ? "bg-blue-100 font-semibold text-blue-700" : "hover:bg-gray-100"
                          }`}
                        >
                          {child.label}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>
      </div>
    </aside>
  );
}

