import type {
  DashboardFiltrosDTO,
  DashboardSuprimentosAlertaDTO,
  DashboardSuprimentosCompraAndamentoDTO,
  DashboardSuprimentosEstoqueCriticoDTO,
  DashboardSuprimentosResumoDTO,
  DashboardSuprimentosSerieDTO,
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

type FiltroParams = {
  idObra?: number | null;
  idUnidade?: number | null;
  idAlmoxarifado?: number | null;
};

function qs(params?: FiltroParams) {
  const q = new URLSearchParams();
  if (params?.idObra) q.set('idObra', String(params.idObra));
  if (params?.idUnidade) q.set('idUnidade', String(params.idUnidade));
  if (params?.idAlmoxarifado) q.set('idAlmoxarifado', String(params.idAlmoxarifado));
  const s = q.toString();
  return s ? `?${s}` : '';
}

export const DashboardSuprimentosApi = {
  filtros: () => api<DashboardFiltrosDTO>('/api/v1/dashboard/me/filtros'),
  resumo: (params?: FiltroParams) => api<DashboardSuprimentosResumoDTO>(`/api/v1/dashboard/suprimentos/resumo${qs(params)}`),
  alertas: (params?: FiltroParams) => api<DashboardSuprimentosAlertaDTO[]>(`/api/v1/dashboard/suprimentos/alertas${qs(params)}`),
  series: (params?: FiltroParams) => api<DashboardSuprimentosSerieDTO[]>(`/api/v1/dashboard/suprimentos/series${qs(params)}`),
  estoqueCritico: (params?: FiltroParams) => api<DashboardSuprimentosEstoqueCriticoDTO[]>(`/api/v1/dashboard/suprimentos/estoque-critico${qs(params)}`),
  comprasAndamento: (params?: FiltroParams) => api<DashboardSuprimentosCompraAndamentoDTO[]>(`/api/v1/dashboard/suprimentos/compras-andamento${qs(params)}`),
  consumoPorObra: (params?: FiltroParams) => api<any[]>(`/api/v1/dashboard/suprimentos/consumo-por-obra${qs(params)}`),
  obterLayout: () => api<any>('/api/v1/dashboard/me/layout?dashboard=SUPRIMENTOS'),
  salvarLayout: (payload: any) => api('/api/v1/dashboard/me/layout', { method: 'PUT', body: JSON.stringify(payload) }),
};
