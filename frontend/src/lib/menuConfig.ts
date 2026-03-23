import type { ComponentType } from 'react';
import {
  BarChart3,
  Briefcase,
  Building2,
  ClipboardList,
  FileText,
  HardDrive,
  LayoutDashboard,
  Map,
  Network,
  Package,
  Settings,
  Shield,
  Users,
  Wrench,
} from 'lucide-react';

export type PermissionCode =
  | 'DASHBOARD_CEO_VIEW'
  | 'DASHBOARD_GERENTE_VIEW'
  | 'OBRAS_VIEW'
  | 'CONTRATOS_VIEW'
  | 'ORCAMENTO_VIEW'
  | 'EXECUCAO_VIEW'
  | 'SUPRIMENTOS_VIEW'
  | 'RH_VIEW'
  | 'SST_VIEW'
  | 'EQUIPAMENTOS_VIEW'
  | 'RELATORIOS_VIEW'
  | 'ORGANOGRAMA_VIEW'
  | 'ADMIN_GOVERNANCA_VIEW'
  | 'ADMIN_BACKUP_VIEW'
  | 'CONFIG_REPRESENTANTE_VIEW'
  | 'CONFIG_ENCARREGADO_VIEW';

export type MenuItem = {
  label: string;
  icon?: ComponentType<{ className?: string }>;
  path?: string;
  permission?: PermissionCode;
  children?: MenuItem[];
};

export const MENU: MenuItem[] = [
  { label: 'Dashboard', icon: LayoutDashboard, path: '/dashboard', permission: 'DASHBOARD_CEO_VIEW' },
  { label: 'Dashboard Gerente', icon: LayoutDashboard, path: '/dashboard/gerente', permission: 'DASHBOARD_GERENTE_VIEW' },
  {
    label: 'Obras',
    icon: Briefcase,
    permission: 'OBRAS_VIEW',
    children: [
      { label: 'Cadastro de Obras', path: '/dashboard/obras' },
      { label: 'Mapa das Obras', icon: Map, path: '/dashboard/obras/mapa' },
      { label: 'Documentos/Fotos', path: '/dashboard/obras/documentos' },
    ],
  },
  { label: 'Contratos', icon: FileText, path: '/dashboard/contratos', permission: 'CONTRATOS_VIEW' },
  {
    label: 'Orçamento e Planejamento',
    icon: BarChart3,
    permission: 'ORCAMENTO_VIEW',
    children: [
      { label: 'Planilhas', path: '/dashboard/orcamento/planilhas' },
      { label: 'Planejamento', path: '/dashboard/orcamento/planejamento' },
      { label: 'Cronograma', path: '/dashboard/orcamento/cronograma' },
      { label: 'LOB', path: '/dashboard/orcamento/lob' },
    ],
  },
  {
    label: 'Execução',
    icon: ClipboardList,
    permission: 'EXECUCAO_VIEW',
    children: [
      { label: 'Diário de Obra', path: '/dashboard/execucao/diario' },
      { label: 'Medições', path: '/dashboard/execucao/medicoes' },
    ],
  },
  {
    label: 'Suprimentos',
    icon: Package,
    permission: 'SUPRIMENTOS_VIEW',
    children: [
      { label: 'Solicitações', path: '/dashboard/suprimentos/solicitacoes' },
      { label: 'Cotações', path: '/dashboard/suprimentos/cotacoes' },
      { label: 'Compras', path: '/dashboard/suprimentos/compras' },
      { label: 'Estoque', path: '/dashboard/suprimentos/estoque' },
      { label: 'Logística', path: '/dashboard/suprimentos/logistica' },
    ],
  },
  {
    label: 'Pessoas e RH',
    icon: Users,
    permission: 'RH_VIEW',
    children: [
      { label: 'Funcionários', path: '/dashboard/rh/funcionarios' },
      { label: 'Presença', path: '/dashboard/rh/presenca' },
      { label: 'Horas Extras', path: '/dashboard/rh/horas-extras' },
    ],
  },
  {
    label: 'SST',
    icon: Shield,
    permission: 'SST_VIEW',
    children: [
      { label: 'Painel SST', path: '/dashboard/sst/painel' },
      { label: 'Fichas', path: '/dashboard/sst/fichas' },
      { label: 'Checklists', path: '/dashboard/sst/checklists' },
      { label: 'EPI', path: '/dashboard/sst/epi' },
      { label: 'Acidentes', path: '/dashboard/sst/acidentes' },
    ],
  },
  { label: 'Equipamentos e Ferramentas', icon: Wrench, path: '/dashboard/equipamentos', permission: 'EQUIPAMENTOS_VIEW' },
  { label: 'Relatórios', icon: FileText, path: '/dashboard/relatorios', permission: 'RELATORIOS_VIEW' },
  { label: 'Organograma', icon: Network, path: '/dashboard/organograma', permission: 'ORGANOGRAMA_VIEW' },
  {
    label: 'Administração da Empresa',
    icon: Building2,
    children: [
      { label: 'Governança de Usuários e Perfis', path: '/dashboard/admin/governanca', permission: 'ADMIN_GOVERNANCA_VIEW' },
      { label: 'Backup e Segurança', icon: HardDrive, path: '/dashboard/admin/backup', permission: 'ADMIN_BACKUP_VIEW' },
    ],
  },
  {
    label: 'Configuração da Empresa',
    icon: Settings,
    children: [
      { label: 'Representante da Empresa', path: '/dashboard/config/representante', permission: 'CONFIG_REPRESENTANTE_VIEW' },
      { label: 'Encarregado do Sistema da Empresa', path: '/dashboard/config/encarregado-sistema', permission: 'CONFIG_ENCARREGADO_VIEW' },
    ],
  },
];
