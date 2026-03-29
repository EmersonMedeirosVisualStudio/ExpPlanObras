export type DashboardExportContexto = 'CEO' | 'DIRETOR' | 'GERENTE' | 'RH' | 'SST' | 'SUPRIMENTOS' | 'ENGENHARIA';

export type DashboardExportFormato = 'PDF' | 'XLSX' | 'CSV';

export type DashboardExportFiltrosDTO = {
  idObra?: number;
  idUnidade?: number;
  idAlmoxarifado?: number;
};

export type DashboardExportRequestDTO = {
  contexto: DashboardExportContexto;
  formato: DashboardExportFormato;
  filtros?: DashboardExportFiltrosDTO;
  incluirWidgets?: string[];
};

export type DashboardExportSectionTableDTO = {
  titulo: string;
  colunas: string[];
  linhas: (string | number | null)[][];
};

export type DashboardExportDataDTO = {
  titulo: string;
  subtitulo?: string;
  filtrosAplicados?: Record<string, string>;
  cards?: { label: string; valor: string | number }[];
  alertas?: { tipo: string; titulo: string; subtitulo?: string; criticidade?: string }[];
  series?: { referencia: string; [key: string]: string | number }[];
  tabelas?: DashboardExportSectionTableDTO[];
};
