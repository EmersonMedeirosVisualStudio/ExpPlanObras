import type { AnalyticsCargaExecucaoDTO, AnalyticsExternalTokenDTO, AnalyticsSaudePipelineDTO } from './types';

type ApiResponse<T> = { success: boolean; message?: string; data: T };

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) }, cache: 'no-store' });
  const json = (await res.json().catch(() => null)) as ApiResponse<T> | null;
  if (!res.ok || !json?.success) throw new Error(json?.message || 'Erro');
  return json.data;
}

export const AnalyticsApi = {
  saude: () => api<AnalyticsSaudePipelineDTO[]>('/api/v1/analytics/admin/saude'),
  execucoes: (limit = 100) => api<AnalyticsCargaExecucaoDTO[]>(`/api/v1/analytics/admin/execucoes?limit=${encodeURIComponent(String(limit))}`),
  pipelines: () => api<any[]>('/api/v1/analytics/admin/pipelines'),
  executar: (pipelineNome: string, tenantId?: number) =>
    api<any>('/api/v1/analytics/admin/executar', { method: 'POST', body: JSON.stringify({ pipelineNome, tenantId }) }),
  reprocessar: (body: { pipelineNome: string; tenantId?: number; dataInicial?: string; dataFinal?: string; full?: boolean }) =>
    api<any>('/api/v1/analytics/admin/reprocessar', { method: 'POST', body: JSON.stringify(body) }),
  datasets: () => api<any[]>('/api/v1/analytics/datasets'),
  metricas: () => api<any[]>('/api/v1/analytics/metricas'),
  listarExternalTokens: (limit = 100) => api<AnalyticsExternalTokenDTO[]>(`/api/v1/analytics/external/token?limit=${encodeURIComponent(String(limit))}`),
  criarExternalToken: (body: { nome: string; datasets: string[]; expiraEm?: string | null }) =>
    api<{ id: number; token: string }>('/api/v1/analytics/external/token', { method: 'POST', body: JSON.stringify(body) }),
  desativarExternalToken: (tokenId: number) => api<void>('/api/v1/analytics/external/token', { method: 'DELETE', body: JSON.stringify({ tokenId }) }),
  testarDatasetExterno: (dataset: string, token: string, params?: Record<string, string>) => {
    const q = new URLSearchParams(params || {});
    const qs = q.toString();
    return api<any>(`/api/v1/analytics/external/datasets/${encodeURIComponent(dataset)}${qs ? `?${qs}` : ''}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
  },
};

