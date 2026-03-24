import type { MenuBadgesMapDTO } from './types';

export type BuildMenuBadgesContext = {
  tenantId: number;
  userId: number;
  permissions: string[];
  scope: {
    empresaTotal: boolean;
    diretorias?: number[];
    obras?: number[];
    unidades?: number[];
  };
};

export type MenuBadgeProvider = {
  key: string;
  requiredPermissions?: string[];
  build: (ctx: BuildMenuBadgesContext) => Promise<MenuBadgesMapDTO>;
};

