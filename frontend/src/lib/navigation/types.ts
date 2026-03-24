export type MenuScopeType = 'EMPRESA' | 'DIRETORIA' | 'OBRA' | 'UNIDADE';

export type MenuBadgeTone = 'NEUTRAL' | 'INFO' | 'WARNING' | 'DANGER';

export type MenuBadgeDTO = {
  value: number;
  label?: string;
  tone: MenuBadgeTone;
  tooltip?: string;
  pulse?: boolean;
};

export type MenuBadgesMapDTO = Record<string, MenuBadgeDTO | undefined>;

export type MenuItemConfig = {
  key: string;
  label: string;
  href?: string;
  icon?: string;
  permission?: string;
  anyPermissions?: string[];
  allPermissions?: string[];
  scopeTypes?: MenuScopeType[];
  children?: MenuItemConfig[];
  homePriority?: number;
  matchStartsWith?: string[];
};

export type MenuSectionConfig = {
  key: string;
  label: string;
  ordem: number;
  items: MenuItemConfig[];
};

export type MenuItemDTO = {
  key: string;
  label: string;
  href?: string;
  icon?: string;
  children?: MenuItemDTO[];
  matchStartsWith?: string[];
};

export type MenuSectionDTO = {
  key: string;
  label: string;
  ordem: number;
  items: MenuItemDTO[];
};

export type MenuResponseDTO = {
  secoes: MenuSectionDTO[];
  homeHref: string;
  badges?: MenuBadgesMapDTO;
};
