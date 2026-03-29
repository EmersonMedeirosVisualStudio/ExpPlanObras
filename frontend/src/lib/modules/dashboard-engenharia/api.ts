import type { DashboardFiltrosDTO } from '@/lib/modules/dashboard-suprimentos/types';
import type {
  DashboardEngenhariaAlertaDTO,
  DashboardEngenhariaMedicaoDTO,
  DashboardEngenhariaObraRiscoDTO,
  DashboardEngenhariaCronogramaAcompanhamentoDTO,
  DashboardEngenhariaResumoDTO,
  DashboardEngenhariaSerieDTO,
} from './types';

type ApiResponse<T> = { success: boolean; message?: string; data: T };

async function api<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const res = await fetch(input, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
    cache: 'no-store',
  });
  const json = (await res.json()) as ApiResponse<T>;
  if (!res.ok || !json.success) throw new Error(json.message || 'Erro');
  return json.data;
}

type FiltroParams = { idObra?: number | null; idUnidade?: number | null };

function qs(params?: FiltroParams) {
  const q = new URLSearchParams();
  if (params?.idObra) q.set('idObra', String(params.idObra));
  if (params?.idUnidade) q.set('idUnidade', String(params.idUnidade));
  const s = q.toString();
  return s ? `?${s}` : '';
}

export const DashboardEngenhariaApi = {
  filtros: () => api<DashboardFiltrosDTO>('/api/v1/dashboard/me/filtros'),
  resumo: (params?: FiltroParams) => api<DashboardEngenhariaResumoDTO>(`/api/v1/dashboard/engenharia/resumo${qs(params)}`),
  alertas: (params?: FiltroParams) => api<DashboardEngenhariaAlertaDTO[]>(`/api/v1/dashboard/engenharia/alertas${qs(params)}`),
  series: (params?: FiltroParams) => api<DashboardEngenhariaSerieDTO[]>(`/api/v1/dashboard/engenharia/series${qs(params)}`),
  obrasRisco: (params?: FiltroParams) => api<DashboardEngenhariaObraRiscoDTO[]>(`/api/v1/dashboard/engenharia/obras-risco${qs(params)}`),
  medicoesPendentes: (params?: FiltroParams) => api<DashboardEngenhariaMedicaoDTO[]>(`/api/v1/dashboard/engenharia/medicoes-pendentes${qs(params)}`),
  cronogramaAcompanhamento: (params: { idObra: number }) =>
    api<DashboardEngenhariaCronogramaAcompanhamentoDTO>(`/api/v1/dashboard/engenharia/cronograma-acompanhamento?idObra=${params.idObra}`),
  obterLayout: () => api<any>('/api/v1/dashboard/me/layout?dashboard=ENGENHARIA'),
  salvarLayout: (payload: any) => api('/api/v1/dashboard/me/layout', { method: 'PUT', body: JSON.stringify(payload) }),
};
