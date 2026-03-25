import { hasPermission } from '@/lib/auth/access';
import { PERMISSIONS } from '@/lib/auth/permissions';
import type { PortalGestorAtalhoDTO, PortalGestorTipoLocal } from './types';

export function buildAtalhosPortalGestor(args: {
  current: any;
  tipoLocal: PortalGestorTipoLocal;
  idObra: number | null;
  idUnidade: number | null;
}): PortalGestorAtalhoDTO[] {
  const { current } = args;

  const atalhos: PortalGestorAtalhoDTO[] = [
    {
      key: 'presenca-hoje',
      label: 'Presença do Dia',
      href: '/dashboard/rh/presencas',
      icon: 'clipboard-check',
      enabled: hasPermission(current, PERMISSIONS.RH_PRESENCAS_VIEW),
    },
    {
      key: 'iniciar-checklist',
      label: 'Iniciar Checklist SST',
      href: '/dashboard/sst/checklists',
      icon: 'check-square',
      enabled: hasPermission(current, PERMISSIONS.SST_CHECKLISTS_VIEW),
    },
    {
      key: 'registrar-nc',
      label: 'Registrar NC',
      href: '/dashboard/sst/nao-conformidades',
      icon: 'alert-triangle',
      enabled: hasPermission(current, PERMISSIONS.SST_NC_VIEW),
    },
    {
      key: 'registrar-acidente',
      label: 'Registrar Acidente',
      href: '/dashboard/sst/acidentes',
      icon: 'siren',
      enabled: hasPermission(current, PERMISSIONS.SST_ACIDENTES_VIEW),
    },
    {
      key: 'suprimentos-solicitacoes',
      label: 'Solicitações Urgentes',
      href: '/dashboard/suprimentos/solicitacoes',
      icon: 'truck',
      enabled: hasPermission(current, PERMISSIONS.DASHBOARD_SUPRIMENTOS_VIEW),
    },
    {
      key: 'aprovacoes',
      label: 'Aprovações',
      href: '/dashboard/aprovacoes',
      icon: 'stamp',
      enabled: hasPermission(current, PERMISSIONS.APROVACOES_VIEW),
    },
    {
      key: 'workflows',
      label: 'Workflows',
      href: '/dashboard/workflows',
      icon: 'git-branch',
      enabled: hasPermission(current, PERMISSIONS.WORKFLOWS_VIEW),
    },
    {
      key: 'sincronizacao',
      label: 'Sincronização',
      href: '/dashboard/sincronizacao',
      icon: 'cloud-off',
      enabled: hasPermission(current, PERMISSIONS.DASHBOARD_VIEW),
    },
  ];

  if (!hasPermission(current, PERMISSIONS.PORTAL_GESTOR_ATALHOS)) {
    return atalhos.map((a) => ({ ...a, enabled: false }));
  }

  return atalhos;
}

