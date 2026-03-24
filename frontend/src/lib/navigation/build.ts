import type { CurrentUser } from '@/lib/auth/current-user';
import { APP_MENU } from './menu';
import type { MenuItemConfig, MenuItemDTO, MenuResponseDTO, MenuScopeType, MenuSectionDTO } from './types';

export type BuildMenuContext = {
  permissions: string[];
  scopeTypes: MenuScopeType[];
};

function toDto(item: MenuItemConfig, children?: MenuItemDTO[]): MenuItemDTO {
  return {
    key: item.key,
    label: item.label,
    href: item.href,
    icon: item.icon,
    matchStartsWith: item.matchStartsWith,
    children: children && children.length ? children : undefined,
  };
}

function hasItemAccess(item: MenuItemConfig, ctx: BuildMenuContext): boolean {
  const permSet = new Set(ctx.permissions);
  const scopeSet = new Set(ctx.scopeTypes);

  const permissionOk =
    (!item.permission || permSet.has(item.permission)) &&
    (!item.anyPermissions || item.anyPermissions.some((p) => permSet.has(p))) &&
    (!item.allPermissions || item.allPermissions.every((p) => permSet.has(p)));

  const scopeOk = !item.scopeTypes || item.scopeTypes.length === 0 || item.scopeTypes.some((s) => scopeSet.has(s));

  return permissionOk && scopeOk;
}

function mapItem(item: MenuItemConfig, ctx: BuildMenuContext): MenuItemDTO | null {
  const visibleChildren = (item.children ?? []).map((child) => mapItem(child, ctx)).filter(Boolean) as MenuItemDTO[];
  const selfVisible = hasItemAccess(item, ctx);
  if (!selfVisible && visibleChildren.length === 0) return null;
  return toDto({ ...item, href: selfVisible ? item.href : undefined }, visibleChildren);
}

export function buildMenu(ctx: BuildMenuContext): MenuSectionDTO[] {
  return APP_MENU.slice()
    .sort((a, b) => a.ordem - b.ordem)
    .map((section) => {
      const items = section.items.map((item) => mapItem(item, ctx)).filter(Boolean) as MenuItemDTO[];
      if (items.length === 0) return null;
      return { key: section.key, label: section.label, ordem: section.ordem, items };
    })
    .filter(Boolean) as MenuSectionDTO[];
}

export function resolveHomeHref(ctx: BuildMenuContext): string {
  const candidates: { href: string; priority: number }[] = [];

  for (const section of APP_MENU) {
    for (const item of section.items) {
      if (item.href && hasItemAccess(item, ctx)) candidates.push({ href: item.href, priority: item.homePriority ?? 9999 });
      for (const child of item.children ?? []) {
        if (child.href && hasItemAccess(child, ctx)) candidates.push({ href: child.href, priority: child.homePriority ?? 9999 });
      }
    }
  }

  candidates.sort((a, b) => a.priority - b.priority);
  return candidates[0]?.href ?? '/dashboard/403';
}

export function buildMenuResponse(ctx: BuildMenuContext): MenuResponseDTO {
  return { secoes: buildMenu(ctx), homeHref: resolveHomeHref(ctx) };
}

export function buildMenuContextFromUser(user: CurrentUser): BuildMenuContext {
  const scopeTypes: MenuScopeType[] = [];
  if (user.abrangencia.empresa) scopeTypes.push('EMPRESA');
  if (Array.isArray(user.abrangencia.diretorias) && user.abrangencia.diretorias.length) scopeTypes.push('DIRETORIA');
  if (Array.isArray(user.abrangencia.obras) && user.abrangencia.obras.length) scopeTypes.push('OBRA');
  if (Array.isArray(user.abrangencia.unidades) && user.abrangencia.unidades.length) scopeTypes.push('UNIDADE');

  return { permissions: user.permissoes as unknown as string[], scopeTypes };
}

export function buildMenuResponseFromUser(user: CurrentUser): MenuResponseDTO {
  return buildMenuResponse(buildMenuContextFromUser(user));
}
