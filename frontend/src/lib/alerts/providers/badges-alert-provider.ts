import type { AlertProvider, AlertSignal, AlertSeverity } from '../types';
import { buildMenuBadges } from '@/lib/navigation/build-menu-badges';

function severityFromTone(tone: string): AlertSeverity {
  if (tone === 'DANGER') return 'CRITICAL';
  if (tone === 'WARNING') return 'WARNING';
  if (tone === 'INFO') return 'INFO';
  return 'INFO';
}

function moduleFromMenuKey(menuKey: string) {
  if (menuKey.startsWith('painel-rh') || menuKey === 'funcionarios' || menuKey === 'presencas') return 'RH' as const;
  if (menuKey.startsWith('painel-sst') || menuKey === 'nao-conformidades' || menuKey === 'acidentes' || menuKey === 'treinamentos' || menuKey === 'checklists')
    return 'SST' as const;
  if (menuKey.startsWith('painel-suprimentos')) return 'SUPRIMENTOS' as const;
  if (menuKey.startsWith('painel-engenharia')) return 'ENGENHARIA' as const;
  return 'ADMIN' as const;
}

export const badgesAlertProvider: AlertProvider = {
  module: 'ADMIN',
  async collect(ctx) {
    const badges = await buildMenuBadges(
      {
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        permissions: ctx.permissions,
        scope: ctx.scope,
      },
      undefined
    );

    const signals: AlertSignal[] = [];
    for (const [menuKey, badge] of Object.entries(badges)) {
      if (!badge || badge.value <= 0) continue;
      const mod = moduleFromMenuKey(menuKey);
      const severity = severityFromTone(badge.tone);
      signals.push({
        module: mod,
        key: `badge.${menuKey}`,
        dedupeKey: `badge.${menuKey}`,
        titulo: `${badge.value > 99 ? '99+' : badge.value} pendência(s)`,
        mensagem: badge.tooltip || `Pendências em ${menuKey}`,
        severity,
        menuKeys: [menuKey],
      });
    }
    return signals;
  },
};

