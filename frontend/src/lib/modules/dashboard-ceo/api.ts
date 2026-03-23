import type { DashboardCeoAlertaDTO, DashboardCeoFinanceiroDTO, DashboardCeoResumoDTO } from './types';

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

export const DashboardCeoApi = {
  resumo: () => api<DashboardCeoResumoDTO>('/api/v1/dashboard/ceo/resumo'),
  financeiro: () => api<DashboardCeoFinanceiroDTO>('/api/v1/dashboard/ceo/financeiro'),
  alertas: () => api<DashboardCeoAlertaDTO[]>('/api/v1/dashboard/ceo/alertas'),
};

