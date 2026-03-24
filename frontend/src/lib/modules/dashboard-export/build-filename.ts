import type { DashboardExportContexto, DashboardExportFormato } from './types';

export function buildDashboardExportFilename(contexto: DashboardExportContexto, formato: DashboardExportFormato) {
  const data = new Date().toISOString().slice(0, 10);
  const ext = formato === 'PDF' ? 'pdf' : 'xlsx';
  const safe = contexto.toLowerCase();
  return `dashboard-${safe}-${data}.${ext}`;
}

