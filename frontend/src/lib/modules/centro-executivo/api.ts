import type {
  CentroExecutivoAlertaDTO,
  CentroExecutivoComparativoDTO,
  CentroExecutivoFiltrosDTO,
  CentroExecutivoMatrizLinhaDTO,
  CentroExecutivoRankingObraDTO,
  CentroExecutivoResumoDTO,
  CentroExecutivoSerieDTO,
  DashboardFiltrosExecutivosDTO,
} from './types';

type ApiResponse<T> = { success: boolean; message?: string; data: T };

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
    cache: 'no-store',
  });
  const json = (await res.json()) as ApiResponse<T>;
  if (!res.ok || !json.success) throw new Error(json.message || 'Erro');
  return json.data;
}

function qs(params?: CentroExecutivoFiltrosDTO) {
  const q = new URLSearchParams();
  if (params?.idDiretoria) q.set('idDiretoria', String(params.idDiretoria));
  if (params?.idObra) q.set('idObra', String(params.idObra));
  if (params?.idUnidade) q.set('idUnidade', String(params.idUnidade));
  if (params?.periodo) q.set('periodo', params.periodo);
  if (params?.dataInicial) q.set('dataInicial', params.dataInicial);
  if (params?.dataFinal) q.set('dataFinal', params.dataFinal);
  if (params?.recorte) q.set('recorte', params.recorte);
  const s = q.toString();
  return s ? `?${s}` : '';
}

export const CentroExecutivoApi = {
  filtros: () => api<DashboardFiltrosExecutivosDTO>('/api/v1/dashboard/me/filtros'),
  resumo: (params?: CentroExecutivoFiltrosDTO) => api<CentroExecutivoResumoDTO>(`/api/v1/dashboard/centro-executivo/resumo${qs(params)}`),
  alertas: (params?: CentroExecutivoFiltrosDTO) => api<CentroExecutivoAlertaDTO[]>(`/api/v1/dashboard/centro-executivo/alertas${qs(params)}`),
  series: (params?: CentroExecutivoFiltrosDTO) => api<CentroExecutivoSerieDTO[]>(`/api/v1/dashboard/centro-executivo/series${qs(params)}`),
  comparativo: (params?: CentroExecutivoFiltrosDTO) => api<CentroExecutivoComparativoDTO[]>(`/api/v1/dashboard/centro-executivo/comparativo${qs(params)}`),
  matriz: (params?: CentroExecutivoFiltrosDTO) => api<CentroExecutivoMatrizLinhaDTO[]>(`/api/v1/dashboard/centro-executivo/matriz${qs(params)}`),
  rankingObras: (params?: CentroExecutivoFiltrosDTO) => api<CentroExecutivoRankingObraDTO[]>(`/api/v1/dashboard/centro-executivo/ranking-obras${qs(params)}`),
  obterLayout: () => api<any>('/api/v1/dashboard/me/layout?dashboard=CENTRO_EXECUTIVO'),
  salvarLayout: (payload: any) => api('/api/v1/dashboard/me/layout', { method: 'PUT', body: JSON.stringify(payload) }),
};

