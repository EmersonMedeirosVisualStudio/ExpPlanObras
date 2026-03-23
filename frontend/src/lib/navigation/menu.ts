import { PERMISSIONS, type Permission } from '@/lib/auth/permissions';
import type { CurrentUser } from '@/lib/auth/current-user';

export type MenuItem = {
  label: string;
  path?: string;
  permission?: Permission;
  children?: MenuItem[];
};

export const MENU_ITEMS: MenuItem[] = [
  { label: 'Dashboard', path: '/dashboard', permission: PERMISSIONS.DASHBOARD_VIEW },
  { label: 'Dashboard Gerente', path: '/dashboard/gerente', permission: PERMISSIONS.DASHBOARD_GERENTE_VIEW },
  {
    label: 'Obras',
    children: [
      { label: 'Cadastro de Obras', path: '/dashboard/obras', permission: PERMISSIONS.OBRAS_VIEW },
      { label: 'Mapa das Obras', path: '/dashboard/obras/mapa', permission: PERMISSIONS.MAPA_OBRAS_VIEW },
      { label: 'Documentos/Fotos', path: '/dashboard/obras/documentos', permission: PERMISSIONS.OBRAS_VIEW },
    ],
  },
  { label: 'Contratos', path: '/dashboard/contratos', permission: PERMISSIONS.OBRAS_VIEW },
  {
    label: 'Orçamento e Planejamento',
    children: [
      { label: 'Planilhas', path: '/dashboard/orcamento/planilhas', permission: PERMISSIONS.OBRAS_VIEW },
      { label: 'Planejamento', path: '/dashboard/orcamento/planejamento', permission: PERMISSIONS.OBRAS_VIEW },
      { label: 'Cronograma', path: '/dashboard/orcamento/cronograma', permission: PERMISSIONS.OBRAS_VIEW },
      { label: 'LOB', path: '/dashboard/orcamento/lob', permission: PERMISSIONS.OBRAS_VIEW },
    ],
  },
  {
    label: 'Execução',
    children: [
      { label: 'Diário de Obra', path: '/dashboard/execucao/diario', permission: PERMISSIONS.OBRAS_VIEW },
      { label: 'Medições', path: '/dashboard/execucao/medicoes', permission: PERMISSIONS.OBRAS_VIEW },
    ],
  },
  {
    label: 'Suprimentos',
    children: [
      { label: 'Solicitações', path: '/dashboard/suprimentos/solicitacoes', permission: PERMISSIONS.OBRAS_VIEW },
      { label: 'Cotações', path: '/dashboard/suprimentos/cotacoes', permission: PERMISSIONS.OBRAS_VIEW },
      { label: 'Compras', path: '/dashboard/suprimentos/compras', permission: PERMISSIONS.OBRAS_VIEW },
      { label: 'Estoque', path: '/dashboard/suprimentos/estoque', permission: PERMISSIONS.OBRAS_VIEW },
      { label: 'Logística', path: '/dashboard/suprimentos/logistica', permission: PERMISSIONS.OBRAS_VIEW },
    ],
  },
  {
    label: 'Pessoas e RH',
    children: [{ label: 'Funcionários', path: '/dashboard/rh/funcionarios', permission: PERMISSIONS.FUNCIONARIOS_VIEW }],
  },
  {
    label: 'SST',
    children: [
      { label: 'Painel SST', path: '/dashboard/sst/painel', permission: PERMISSIONS.SST_VIEW },
      { label: 'Fichas', path: '/dashboard/sst/fichas', permission: PERMISSIONS.SST_VIEW },
      { label: 'Checklists', path: '/dashboard/sst/checklists', permission: PERMISSIONS.SST_VIEW },
      { label: 'EPI', path: '/dashboard/sst/epi', permission: PERMISSIONS.SST_VIEW },
    ],
  },
  { label: 'Equipamentos e Ferramentas', path: '/dashboard/equipamentos', permission: PERMISSIONS.EQUIPAMENTOS_VIEW },
  { label: 'Relatórios', path: '/dashboard/relatorios', permission: PERMISSIONS.DASHBOARD_VIEW },
  { label: 'Organograma', path: '/dashboard/organograma', permission: PERMISSIONS.ORGANOGRAMA_VIEW },
  {
    label: 'Administração da Empresa',
    children: [
      { label: 'Governança de Usuários e Perfis', path: '/dashboard/admin/governanca', permission: PERMISSIONS.GOVERNANCA_VIEW },
      { label: 'Backup e Segurança', path: '/dashboard/admin/backup', permission: PERMISSIONS.BACKUP_VIEW },
    ],
  },
  {
    label: 'Configuração da Empresa',
    children: [
      { label: 'Representante da Empresa', path: '/dashboard/config/representante', permission: PERMISSIONS.REPRESENTANTE_VIEW },
      { label: 'Encarregado do Sistema da Empresa', path: '/dashboard/config/encarregado-sistema', permission: PERMISSIONS.REPRESENTANTE_VIEW },
    ],
  },
];

export function filterMenuByPermission(items: MenuItem[], user: CurrentUser): MenuItem[] {
  return items
    .map((item) => {
      const children = item.children ? filterMenuByPermission(item.children, user) : undefined;
      const hasItemPermission = item.permission ? user.permissoes.includes(item.permission) : true;
      const hasVisibleChildren = Boolean(children?.length);
      if (hasItemPermission || hasVisibleChildren) return { ...item, children };
      return null;
    })
    .filter(Boolean) as MenuItem[];
}
