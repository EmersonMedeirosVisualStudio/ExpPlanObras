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

function qs(f?: { idObra?: number | null; idUnidade?: number | null }) {
  const p = new URLSearchParams();
  if (f?.idObra) p.set('idObra', String(f.idObra));
  if (f?.idUnidade) p.set('idUnidade', String(f.idUnidade));
  return p.toString() ? `?${p.toString()}` : '';
}

export const DashboardRhApi = {
  filtros: () => api<any>('/api/v1/dashboard/me/filtros'),
  resumo: (f?: { idObra?: number | null; idUnidade?: number | null }) => api<any>(`/api/v1/dashboard/rh/resumo${qs(f)}`),
  alertas: (f?: { idObra?: number | null; idUnidade?: number | null }) => api<any[]>(`/api/v1/dashboard/rh/alertas${qs(f)}`),
  series: (f?: { idObra?: number | null; idUnidade?: number | null }) => api<any>(`/api/v1/dashboard/rh/series${qs(f)}`),
  obterLayout: () => api<any>('/api/v1/dashboard/me/layout?dashboard=RH'),
  salvarLayout: (payload: any) => api('/api/v1/dashboard/me/layout', { method: 'PUT', body: JSON.stringify(payload) }),
};

