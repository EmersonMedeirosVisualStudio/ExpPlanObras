import type { DashboardExportContexto, DashboardExportDataDTO, DashboardExportFiltrosDTO } from './types';
import type { Permission } from '@/lib/auth/permissions';

export type DashboardExportProvider = {
  contexto: DashboardExportContexto;
  requiredPermission: Permission;
  build: (args: {
    tenantId: number;
    userId: number;
    filtros?: DashboardExportFiltrosDTO;
    incluirWidgets?: string[];
  }) => Promise<DashboardExportDataDTO>;
};
