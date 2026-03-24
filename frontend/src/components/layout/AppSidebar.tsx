"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { CurrentUser } from "@/lib/auth/current-user";
import { useMemo, useState } from "react";
import { buildMenuResponseFromUser } from "@/lib/navigation/build";

export function AppSidebar({ user }: { user: CurrentUser }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});

  const menu = useMemo(() => buildMenuResponseFromUser(user).secoes, [user]);

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

        <nav className="space-y-4">
          {menu.map((secao) => (
            <div key={secao.key}>
              {collapsed ? null : <div className="mb-2 px-3 text-xs font-semibold uppercase text-gray-400">{secao.label}</div>}
              <div className="space-y-2">
                {secao.items.map((item) => {
                  if (item.href) {
                    const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                    return (
                      <Link
                        key={item.key}
                        href={item.href}
                        className={`block rounded px-3 py-2 text-sm ${
                          active ? "bg-blue-100 font-semibold text-blue-700" : "hover:bg-gray-100"
                        }`}
                        title={item.label}
                      >
                        {collapsed ? item.label.charAt(0) : item.label}
                      </Link>
                    );
                  }

                  const open = Boolean(openGroups[item.key]);
                  return (
                    <div key={item.key} className="space-y-1">
                      <button
                        type="button"
                        onClick={() => setOpenGroups((p) => ({ ...p, [item.key]: !open }))}
                        className="w-full text-left px-3 py-2 text-xs font-semibold uppercase text-gray-500 hover:bg-gray-50 rounded"
                        title={item.label}
                      >
                        {collapsed ? item.label.charAt(0) : item.label}
                      </button>
                      {open && !collapsed && (
                        <div className="space-y-1">
                          {item.children?.map((child) => {
                            const active = pathname === child.href || pathname.startsWith(`${child.href}/`);
                            return (
                              <Link
                                key={child.key}
                                href={child.href!}
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
              </div>
            </div>
          ))}
        </nav>
      </div>
    </aside>
  );
}
