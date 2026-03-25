import type { DashboardFiltrosExecutivosDTO } from '@/lib/modules/centro-executivo/types';
import type {
  PortalGestorAgendaDTO,
  PortalGestorAtalhoDTO,
  PortalGestorEquipeItemDTO,
  PortalGestorPendenciaDTO,
  PortalGestorResumoDTO,
  PortalGestorSstLocalDTO,
  PortalGestorSuprimentosDTO,
  PortalGestorTipoLocal,
} from './types';

type ApiResponse<T> = { success: boolean; message?: string; data: T };

type Filtros = {
  tipoLocal?: PortalGestorTipoLocal;
  idObra?: number;
  idUnidade?: number;
  dataReferencia?: string;
};

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

function qs(params?: Filtros) {
  const q = new URLSearchParams();
  if (params?.tipoLocal) q.set('tipoLocal', params.tipoLocal);
  if (params?.idObra) q.set('idObra', String(params.idObra));
  if (params?.idUnidade) q.set('idUnidade', String(params.idUnidade));
  if (params?.dataReferencia) q.set('dataReferencia', params.dataReferencia);
  const s = q.toString();
  return s ? `?${s}` : '';
}

export const PortalGestorApi = {
  filtros: () => api<DashboardFiltrosExecutivosDTO>('/api/v1/dashboard/me/filtros'),
  resumo: (params?: Filtros) => api<PortalGestorResumoDTO>(`/api/v1/portal-gestor/resumo${qs(params)}`),
  equipe: (params?: Filtros) => api<PortalGestorEquipeItemDTO[]>(`/api/v1/portal-gestor/equipe${qs(params)}`),
  pendencias: (params?: Filtros) => api<PortalGestorPendenciaDTO[]>(`/api/v1/portal-gestor/pendencias${qs(params)}`),
  agenda: (params?: Filtros) => api<PortalGestorAgendaDTO[]>(`/api/v1/portal-gestor/agenda${qs(params)}`),
  atalhos: (params?: Filtros) => api<PortalGestorAtalhoDTO[]>(`/api/v1/portal-gestor/atalhos${qs(params)}`),
  sstLocal: (params?: Filtros) => api<PortalGestorSstLocalDTO>(`/api/v1/portal-gestor/sst-local${qs(params)}`),
  suprimentosLocal: (params?: Filtros) => api<PortalGestorSuprimentosDTO>(`/api/v1/portal-gestor/suprimentos-local${qs(params)}`),
  obterLayout: () => api<any>('/api/v1/dashboard/me/layout?contexto=PORTAL_GESTOR'),
  salvarLayout: (body: { widgets: any[] }) =>
    api<any>('/api/v1/dashboard/me/layout', {
      method: 'PUT',
      body: JSON.stringify({ contexto: 'PORTAL_GESTOR', widgets: body.widgets }),
    }),
};

