"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { NavigationApi } from "@/lib/navigation/api";
import { HomeApi } from "@/lib/home/api";
import type { MenuBadgesMapDTO, MenuItemDTO, MenuSectionDTO } from "@/lib/navigation/types";
import { useRealtimeEvent } from "@/lib/realtime/hooks";
import * as LucideIcons from "lucide-react";
import type { ComponentType } from "react";

function collectHrefs(items: MenuItemDTO[], out: string[]) {
  for (const it of items) {
    if (it.href) out.push(it.href);
    if (it.children?.length) collectHrefs(it.children, out);
  }
}

function getBestMatchHref(pathname: string, hrefs: string[]): string | null {
  let best: string | null = null;
  let bestScore = -1;

  for (const href of hrefs) {
    if (href === "/dashboard") {
      if (pathname === "/dashboard") return "/dashboard";
      continue;
    }

    if (pathname === href) {
      const score = href.length + 10000;
      if (score > bestScore) {
        bestScore = score;
        best = href;
      }
      continue;
    }

    if (pathname.startsWith(`${href}/`)) {
      const score = href.length;
      if (score > bestScore) {
        bestScore = score;
        best = href;
      }
    }
  }

  return best;
}

function isActive(activeHref: string | null, item: MenuItemDTO): boolean {
  if (activeHref && item.href === activeHref) return true;
  return (item.children ?? []).some((child) => isActive(activeHref, child));
}

type SidebarIconProps = { className?: string };

function toPascalCaseIconName(icon: string): string {
  return String(icon)
    .trim()
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
}

function resolveIconComponent(icon?: string): ComponentType<SidebarIconProps> | null {
  const raw = String(icon || "").trim();
  if (!raw) return null;
  const pascal = toPascalCaseIconName(raw);
  const icons = LucideIcons as unknown as Record<string, ComponentType<SidebarIconProps> | undefined>;
  return icons[pascal] ?? (LucideIcons.Circle as unknown as ComponentType<SidebarIconProps>);
}

function BadgePill({ badge, compact }: { badge: NonNullable<MenuBadgesMapDTO[string]>; compact?: boolean }) {
  const color =
    badge.tone === "DANGER"
      ? "bg-red-500/20 text-red-200"
      : badge.tone === "WARNING"
        ? "bg-amber-500/20 text-amber-200"
        : badge.tone === "INFO"
          ? "bg-blue-500/20 text-blue-200"
          : "bg-slate-500/20 text-slate-200";

  const value = badge.value > 99 ? "99+" : String(badge.value);

  return (
    <span
      title={badge.tooltip}
      className={`inline-flex items-center justify-center rounded-full text-xs font-semibold ${color} ${
        compact ? "min-w-[1.25rem] px-1.5 py-0.5" : "min-w-[1.5rem] px-2 py-0.5"
      } ${badge.pulse ? "animate-pulse" : ""}`}
    >
      {badge.label || value}
    </span>
  );
}

function MenuNode({
  item,
  activeHref,
  badges,
  depth,
  collapsed,
}: {
  item: MenuItemDTO;
  activeHref: string | null;
  badges: MenuBadgesMapDTO;
  depth: number;
  collapsed: boolean;
}) {
  const active = isActive(activeHref, item);
  const [open, setOpen] = useState(active);
  const badge = badges[item.key];
  const Icon = resolveIconComponent(item.icon);
  const isSub = depth > 0;
  const baseItemClass = "flex items-center justify-between rounded-lg px-3 py-2 text-sm transition-colors";
  const activeClass = "bg-[#2563EB] font-medium text-white";
  const inactiveClass = isSub
    ? "text-[#D1D5DB] hover:bg-[#374151] hover:text-white"
    : "text-[#D1D5DB] hover:bg-[#1F2937] hover:text-white";
  const iconClass = `h-4 w-4 shrink-0 ${active ? "text-white" : "text-[#9CA3AF]"}`;

  useEffect(() => {
    if (active) setOpen(true);
  }, [active]);

  return (
    <div className="space-y-1">
      {item.href ? (
        <Link
          href={item.href}
          className={`${baseItemClass} ${active ? activeClass : inactiveClass}`}
          title={collapsed ? item.label : undefined}
        >
          <span className="flex min-w-0 items-center gap-2">
            {Icon ? <Icon className={iconClass} /> : null}
            {collapsed ? null : <span className="truncate">{item.label}</span>}
          </span>
          {badge ? <BadgePill badge={badge} compact={collapsed} /> : null}
        </Link>
      ) : (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className={`${baseItemClass} w-full ${active ? activeClass : inactiveClass}`}
          title={collapsed ? item.label : undefined}
        >
          <span className="flex min-w-0 items-center gap-2">
            {Icon ? <Icon className={iconClass} /> : null}
            {collapsed ? null : <span className="truncate">{item.label}</span>}
          </span>
          {badge ? <BadgePill badge={badge} compact={collapsed} /> : null}
        </button>
      )}

      {item.children?.length && !collapsed ? (
        <div className={`${open ? "" : "hidden"} ml-2 rounded-lg bg-[#1F2937] p-2 space-y-1`}>
          {item.children.map((child) => (
            <MenuNode key={child.key} item={child} activeHref={activeHref} badges={badges} depth={depth + 1} collapsed={collapsed} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function flattenItems(items: MenuItemDTO[], out: Map<string, MenuItemDTO>) {
  for (const it of items) {
    out.set(it.key, it);
    if (it.children?.length) flattenItems(it.children, out);
  }
}

export function SidebarNav({ secoes, initialBadges = {} }: { secoes: MenuSectionDTO[]; initialBadges?: MenuBadgesMapDTO }) {
  const pathname = usePathname();
  const [badges, setBadges] = useState<MenuBadgesMapDTO>(initialBadges);
  const [favoritos, setFavoritos] = useState<string[]>([]);
  const [collapsed, setCollapsed] = useState(false);

  const hrefs = useMemo(() => {
    const out: string[] = [];
    for (const s of secoes) collectHrefs(s.items, out);
    return Array.from(new Set(out));
  }, [secoes]);

  const activeHref = useMemo(() => getBestMatchHref(pathname, hrefs), [pathname, hrefs]);

  const itemsMap = useMemo(() => {
    const m = new Map<string, MenuItemDTO>();
    for (const s of secoes) flattenItems(s.items, m);
    return m;
  }, [secoes]);

  useEffect(() => {
    let active = true;

    async function carregar() {
      try {
        const data = await NavigationApi.obterBadges();
        if (active) setBadges(data);
      } catch {}
    }

    carregar();
    const id = window.setInterval(carregar, 60000);

    return () => {
      active = false;
      window.clearInterval(id);
    };
  }, []);

  useRealtimeEvent("menu", "menu.badges.refresh", async () => {
    try {
      const data = await NavigationApi.obterBadges();
      setBadges(data);
    } catch {}
  });
  useRealtimeEvent("notifications", "notification.new", async () => {
    try {
      const data = await NavigationApi.obterBadges();
      setBadges(data);
    } catch {}
  });
  useRealtimeEvent("notifications", "notification.read", async () => {
    try {
      const data = await NavigationApi.obterBadges();
      setBadges(data);
    } catch {}
  });

  useEffect(() => {
    let active = true;
    HomeApi.obterFavoritos()
      .then((rows) => {
        if (active) setFavoritos(rows.map((r) => r.menuKey));
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  async function toggleFavorito(menuKey: string) {
    const novo = favoritos.includes(menuKey) ? favoritos.filter((k) => k !== menuKey) : [...favoritos, menuKey];
    setFavoritos(novo);
    const dedup = Array.from(new Set(novo));
    await HomeApi.salvarFavoritos(dedup.map((menuKey, idx) => ({ menuKey, ordem: idx })));
  }

  return (
    <aside className={`border-r border-white/10 bg-[#111827] ${collapsed ? "w-16" : "w-60"} transition-all`}>
      <div className="p-4">
        <div className="flex items-center justify-between gap-2">
          <Link href="/dashboard" className="flex items-center gap-2 min-w-0">
            <div className="h-9 w-9 rounded-lg bg-white/10 overflow-hidden flex items-center justify-center">
              <Image src="/LogoDoSistema3.jpg" alt="Logo" width={36} height={36} className="h-9 w-9 object-contain" />
            </div>
            {collapsed ? null : <div className="text-base font-semibold text-white truncate">ExpPlanObras</div>}
          </Link>
          <button
            type="button"
            onClick={() => setCollapsed((v) => !v)}
            className="rounded-lg p-2 text-[#9CA3AF] hover:bg-[#1F2937] hover:text-white"
            title={collapsed ? "Expandir menu" : "Recolher menu"}
          >
            <LucideIcons.Menu className="h-4 w-4" />
          </button>
        </div>
      </div>

      <nav className="space-y-6 px-3 pb-6">
        {favoritos.length ? (
          <div key="favoritos">
            {collapsed ? null : <div className="mb-2 px-2 text-xs font-semibold uppercase text-[#9CA3AF]">Favoritos</div>}
            <div className="space-y-1">
              {favoritos
                .map((k) => itemsMap.get(k))
                .filter((it): it is MenuItemDTO => !!it && !!it.href)
                .map((it) => {
                  const active = !!activeHref && it.href === activeHref;
                  const badge = badges[it.key];
                  const Icon = resolveIconComponent(it.icon);
                  return (
                    <Link
                      key={`fav-${it.key}`}
                      href={it.href!}
                      className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm transition-colors ${
                        active ? "bg-[#2563EB] font-medium text-white" : "text-[#D1D5DB] hover:bg-[#1F2937] hover:text-white"
                      }`}
                      title={collapsed ? it.label : undefined}
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        {Icon ? <Icon className={`h-4 w-4 shrink-0 ${active ? "text-white" : "text-[#9CA3AF]"}`} /> : null}
                        {collapsed ? null : <span className="truncate">{it.label}</span>}
                      </span>
                      {badge ? <BadgePill badge={badge} compact={collapsed} /> : null}
                    </Link>
                  );
                })}
            </div>
          </div>
        ) : null}
        {secoes.map((secao) => (
          <div key={secao.key}>
            {collapsed ? null : <div className="mb-2 px-2 text-xs font-semibold uppercase text-[#9CA3AF]">{secao.label}</div>}

            <div className="space-y-1">
              {secao.items.map((item) => (
                <MenuNode key={item.key} item={item} activeHref={activeHref} badges={badges} depth={0} collapsed={collapsed} />
              ))}
            </div>
          </div>
        ))}
      </nav>
    </aside>
  );
}
