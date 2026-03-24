import type { BuildMenuBadgesContext } from './badges';
import { MENU_BADGE_PROVIDERS } from './badge-registry';
import type { MenuBadgesMapDTO } from './types';

export async function buildMenuBadges(ctx: BuildMenuBadgesContext, allowedKeys?: Set<string>): Promise<MenuBadgesMapDTO> {
  const permissionSet = new Set(ctx.permissions);

  const providers = MENU_BADGE_PROVIDERS.filter((provider) => {
    if (!provider.requiredPermissions?.length) return true;
    return provider.requiredPermissions.some((p) => permissionSet.has(p));
  });

  const results = await Promise.all(providers.map((p) => p.build(ctx)));

  return results.reduce<MenuBadgesMapDTO>((acc, cur) => {
    for (const [key, badge] of Object.entries(cur)) {
      if (!badge || badge.value <= 0) continue;
      if (allowedKeys && !allowedKeys.has(key)) continue;
      acc[key] = badge;
    }
    return acc;
  }, {});
}

