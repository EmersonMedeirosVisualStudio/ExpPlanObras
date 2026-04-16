"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { NavigationApi } from "@/lib/navigation/api";
import { HomeApi } from "@/lib/home/api";
import type { MenuBadgesMapDTO, MenuItemDTO, MenuSectionDTO } from "@/lib/navigation/types";
import { useRealtimeEvent } from "@/lib/realtime/hooks";
import * as LucideIcons from "lucide-react";
import type { ComponentType } from "react";
import { getActiveObra, subscribeActiveObra } from "@/lib/obra/active";
import { PERMISSIONS } from "@/lib/auth/permissions";

function isActive(pathname: string, item: MenuItemDTO): boolean {
  if (item.href === "/dashboard") return pathname === "/dashboard";
  if (item.href && (pathname === item.href || pathname.startsWith(`${item.href}/`))) return true;
  if (item.matchStartsWith?.some((p) => pathname.startsWith(p))) return true;
  return (item.children ?? []).some((child) => isActive(pathname, child));
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

function BadgePill({ badge }: { badge: NonNullable<MenuBadgesMapDTO[string]> }) {
  const color =
    badge.tone === "DANGER"
      ? "bg-red-100 text-red-700"
      : badge.tone === "WARNING"
        ? "bg-amber-100 text-amber-700"
        : badge.tone === "INFO"
          ? "bg-blue-100 text-blue-700"
          : "bg-slate-100 text-slate-700";

  const value = badge.value > 99 ? "99+" : String(badge.value);

  return (
    <span
      title={badge.tooltip}
      className={`inline-flex min-w-[1.5rem] items-center justify-center rounded-full px-2 py-0.5 text-xs font-semibold ${color} ${
        badge.pulse ? "animate-pulse" : ""
      }`}
    >
      {badge.label || value}
    </span>
  );
}

function MenuNode({ item, pathname, badges }: { item: MenuItemDTO; pathname: string; badges: MenuBadgesMapDTO }) {
  const active = isActive(pathname, item);
  const [open, setOpen] = useState(active);
  const badge = badges[item.key];
  const Icon = resolveIconComponent(item.icon);

  return (
    <div className="space-y-1">
      {item.href ? (
        <Link
          href={item.href}
          className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm ${
            active ? "bg-blue-50 font-medium text-blue-700" : "text-slate-700 hover:bg-slate-50"
          }`}
        >
          <span className="flex min-w-0 items-center gap-2">
            {Icon ? <Icon className="h-4 w-4 shrink-0 opacity-80" /> : null}
            <span className="truncate">{item.label}</span>
          </span>
          {badge ? <BadgePill badge={badge} /> : null}
        </Link>
      ) : (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm ${
            active ? "bg-blue-50 font-medium text-blue-700" : "text-slate-700 hover:bg-slate-50"
          }`}
        >
          <span className="flex min-w-0 items-center gap-2">
            {Icon ? <Icon className="h-4 w-4 shrink-0 opacity-80" /> : null}
            <span className="truncate">{item.label}</span>
          </span>
          {badge ? <BadgePill badge={badge} /> : null}
        </button>
      )}

      {item.children?.length ? (
        <div className={`ml-3 space-y-1 border-l pl-3 ${open ? "" : "hidden"}`}>
          {item.children.map((child) => (
            <MenuNode key={child.key} item={child} pathname={pathname} badges={badges} />
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
  const [activeObra, setActiveObra] = useState(() => getActiveObra());

  useEffect(() => subscribeActiveObra(() => setActiveObra(getActiveObra())), []);

  function readPermissionSet() {
    if (typeof document === "undefined") return new Set<string>();
    const cookies = document.cookie.split(";").map((c) => c.trim());
    const raw = cookies.find((c) => c.startsWith("exp_user="))?.slice("exp_user=".length);
    if (!raw) return new Set<string>();
    try {
      const decoded = decodeURIComponent(raw);
      const parsed = JSON.parse(decoded) as any;
      const perms = Array.isArray(parsed?.permissoes) ? (parsed.permissoes as any[]).map((p) => String(p)) : [];
      return new Set<string>(perms);
    } catch {
      return new Set<string>();
    }
  }

  const mergedSections = useMemo(() => {
    const permissionSet = readPermissionSet();
    const has = (perm?: string) => {
      if (!perm) return true;
      if (permissionSet.has("*")) return true;
      return permissionSet.has(perm);
    };

    const obraId = activeObra?.id ? Number(activeObra.id) : 0;
    const obraNome = activeObra?.nome ? String(activeObra.nome) : null;
    const obraLabel = obraId ? `Obra: ${obraNome || `#${obraId}`}` : "Obra (selecionar)";

    const planejamentoChildren: MenuItemDTO[] = [
      { key: "obra-planejamento-dashboard", label: "Dashboard", href: "/dashboard/engenharia/painel", icon: "layout-dashboard", permission: PERMISSIONS.DASHBOARD_ENGENHARIA_VIEW } as any,
      { key: "obra-planejamento-cadastro", label: "Cadastro da Obra", href: obraId ? `/dashboard/engenharia/obras/${obraId}` : "/dashboard/engenharia/obras", icon: "construction", permission: PERMISSIONS.DASHBOARD_ENGENHARIA_VIEW } as any,
      { key: "obra-planejamento-orcamento", label: "Orçamento (Planilha)", href: obraId ? `/dashboard/engenharia/obras/${obraId}/planilha` : "/dashboard/engenharia/obras", icon: "calculator", permission: PERMISSIONS.DASHBOARD_ENGENHARIA_VIEW } as any,
      { key: "obra-planejamento-cronograma", label: "Cronograma / Programação", href: obraId ? `/dashboard/engenharia/obras/${obraId}/programacao` : "/dashboard/engenharia/obras", icon: "calendar", permission: PERMISSIONS.DASHBOARD_ENGENHARIA_VIEW } as any,
      { key: "obra-planejamento-centro-custos", label: "Centro de Custos", href: "/dashboard/engenharia/cadastros/centros-custo", icon: "layers", permission: PERMISSIONS.DASHBOARD_ENGENHARIA_VIEW } as any,
      { key: "obra-planejamento-contrato", label: "Contrato da Obra", href: obraId ? `/dashboard/engenharia/obras/${obraId}/contrato` : "/dashboard/engenharia/obras", icon: "file-text", permission: PERMISSIONS.DASHBOARD_ENGENHARIA_VIEW } as any,
    ].filter((it: any) => has(it.permission));

    const execucaoChildren: MenuItemDTO[] = [
      { key: "obra-execucao-portal", label: "Portal do Gestor", href: "/dashboard/gestor/portal", icon: "briefcase", permission: PERMISSIONS.PORTAL_GESTOR_VIEW } as any,
      { key: "obra-execucao-apropriacao", label: "Apropriação", href: obraId ? `/dashboard/engenharia/obras/${obraId}/apropriacao` : "/dashboard/engenharia/obras", icon: "timer", permission: PERMISSIONS.DASHBOARD_ENGENHARIA_VIEW } as any,
      { key: "obra-execucao-medicoes", label: "Medições / Fiscalização", href: "/dashboard/fiscalizacao/painel", icon: "clipboard-check", permission: PERMISSIONS.DASHBOARD_FISCALIZACAO_VIEW } as any,
      { key: "obra-execucao-suprimentos", label: "Almoxarifado / Materiais", href: "/dashboard/suprimentos/painel", icon: "package", permission: PERMISSIONS.DASHBOARD_SUPRIMENTOS_VIEW } as any,
    ].filter((it: any) => has(it.permission));

    const obraSection: MenuSectionDTO = {
      key: "obra",
      label: "Obra",
      ordem: 0,
      items: [
        {
          key: "obra-ativo",
          label: obraLabel,
          icon: "construction",
          children: [
            { key: "obra-trocar", label: obraId ? "Trocar obra" : "Selecionar obra", href: "/dashboard/engenharia/obras", icon: "arrow-left-right", permission: PERMISSIONS.DASHBOARD_ENGENHARIA_VIEW } as any,
            {
              key: "obra-planejamento",
              label: "Planejamento",
              icon: "layout-dashboard",
              children: planejamentoChildren,
            } as any,
            {
              key: "obra-execucao",
              label: "Execução",
              icon: "activity",
              children: execucaoChildren,
            } as any,
          ].filter((it: any) => !it.permission || has(it.permission)),
        } as any,
      ],
    };

    return [obraSection, ...secoes];
  }, [secoes, activeObra]);

  const itemsMap = useMemo(() => {
    const m = new Map<string, MenuItemDTO>();
    for (const s of mergedSections) flattenItems(s.items, m);
    return m;
  }, [mergedSections]);

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
    <aside className="w-72 border-r bg-white">
      <div className="p-4 text-lg font-semibold">Sistema</div>

      <nav className="space-y-6 p-4">
        {favoritos.length ? (
          <div key="favoritos">
            <div className="mb-2 text-xs font-semibold uppercase text-slate-500">Favoritos</div>
            <div className="space-y-1">
              {favoritos
                .map((k) => itemsMap.get(k))
                .filter((it): it is MenuItemDTO => !!it && !!it.href)
                .map((it) => {
                  const active = it.href === "/dashboard" ? pathname === "/dashboard" : pathname === it.href || pathname.startsWith(`${it.href}/`);
                  const badge = badges[it.key];
                  const Icon = resolveIconComponent(it.icon);
                  return (
                    <Link
                      key={`fav-${it.key}`}
                      href={it.href!}
                      className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm ${
                        active ? "bg-blue-50 font-medium text-blue-700" : "text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        {Icon ? <Icon className="h-4 w-4 shrink-0 opacity-80" /> : null}
                        <span className="truncate">{it.label}</span>
                      </span>
                      {badge ? <BadgePill badge={badge} /> : null}
                    </Link>
                  );
                })}
            </div>
          </div>
        ) : null}
        {mergedSections.map((secao) => (
          <div key={secao.key}>
            <div className="mb-2 text-xs font-semibold uppercase text-slate-500">{secao.label}</div>

            <div className="space-y-1">
              {secao.items.map((item) => (
                <MenuNode key={item.key} item={item} pathname={pathname} badges={badges} />
              ))}
            </div>
          </div>
        ))}
      </nav>
    </aside>
  );
}
