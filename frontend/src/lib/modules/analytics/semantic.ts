export type AnalyticsMetricDef = {
  key: string;
  label: string;
  dataset: string;
  description: string;
};

export const ANALYTICS_METRICS: AnalyticsMetricDef[] = [
  { key: 'presencas_presentes', label: 'Presenças (presentes)', dataset: 'rh_presencas_diarias', description: 'Total de presentes por dia/local.' },
  { key: 'presencas_ausentes', label: 'Presenças (ausentes)', dataset: 'rh_presencas_diarias', description: 'Total de ausentes por dia/local.' },
  { key: 'sst_ncs_total', label: 'SST (NCs)', dataset: 'sst_nc', description: 'Total de não conformidades por data/local.' },
  { key: 'suprimentos_solicitacoes', label: 'Suprimentos (solicitações)', dataset: 'suprimentos_solicitacoes', description: 'Total de solicitações por data/local.' },
];

