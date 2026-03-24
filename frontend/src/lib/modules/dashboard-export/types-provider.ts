import type { DashboardExportContexto, DashboardExportDataDTO, DashboardExportFiltrosDTO } from './types';

export type DashboardExportProvider = {
  contexto: DashboardExportContexto;
  requiredPermission: string;
  build: (args: {
    tenantId: number;
    userId: number;
    filtros?: DashboardExportFiltrosDTO;
    incluirWidgets?: string[];
  }) => Promise<DashboardExportDataDTO>;
};
