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

export const DashboardDiretorApi = {
  resumo: () => api<any>('/api/v1/dashboard/diretor/resumo'),
  alertas: () => api<any[]>('/api/v1/dashboard/diretor/alertas'),
  obterLayout: () => api<any>('/api/v1/dashboard/me/layout?dashboard=DIRETOR'),
  salvarLayout: (payload: any) => api('/api/v1/dashboard/me/layout', { method: 'PUT', body: JSON.stringify(payload) }),
};

