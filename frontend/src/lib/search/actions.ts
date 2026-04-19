import type { GlobalSearchModulo, GlobalSearchResultDTO } from './types';

export type SearchQuickAction = {
  key: string;
  titulo: string;
  subtitulo?: string | null;
  rota?: string | null;
  permission?: string | null;
  icon?: string | null;
  modulo: GlobalSearchModulo;
};

export const SEARCH_QUICK_ACTIONS: SearchQuickAction[] = [
  { key: 'abrir.painel.rh', titulo: 'Abrir Dashboard RH', rota: '/dashboard/rh/painel', permission: 'dashboard.rh.view', modulo: 'RH' },
  { key: 'abrir.painel.sst', titulo: 'Abrir Painel SST', rota: '/dashboard/sst/painel', permission: 'sst.painel.view', modulo: 'SST' },
  { key: 'abrir.painel.engenharia', titulo: 'Abrir Painel Engenharia', rota: '/dashboard/engenharia/painel', permission: 'dashboard.engenharia.view', modulo: 'ENGENHARIA' },
  { key: 'abrir.relatorios.agendados', titulo: 'Abrir Relatórios Agendados', rota: '/dashboard/relatorios/agendados', permission: 'relatorios.agendados.view', modulo: 'ADMIN' },
  { key: 'abrir.backup', titulo: 'Abrir Backup e Segurança', rota: '/dashboard/backup', permission: 'admin.backup.view', modulo: 'ADMIN' },
];

export function buildQuickActionResults(args: { permissions: string[] }): GlobalSearchResultDTO[] {
  const perm = new Set(args.permissions);
  return SEARCH_QUICK_ACTIONS.filter((a) => !a.permission || perm.has(a.permission)).map((a) => ({
    id: `acao:${a.key}`,
    type: 'ACAO',
    modulo: a.modulo,
    titulo: a.titulo,
    subtitulo: a.subtitulo ?? null,
    rota: a.rota ?? null,
    score: 50,
    icon: a.icon ?? null,
    metadata: { actionKey: a.key },
  }));
}

