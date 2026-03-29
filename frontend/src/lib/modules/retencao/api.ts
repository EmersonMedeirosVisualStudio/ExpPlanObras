import apiClient from '@/lib/api';
import type { DescarteLoteDTO, LegalHoldDTO, RetencaoItemDTO, RetencaoPoliticaDTO } from './types';

type ApiResponse<T> = { success: boolean; message?: string; data: T; meta?: any };

function qs(params?: Record<string, unknown>) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params || {})) {
    if (v === undefined || v === null || v === '') continue;
    p.set(k, String(v));
  }
  return p.toString() ? `?${p.toString()}` : '';
}

async function api<T>(path: string, init?: { method?: 'GET' | 'POST' | 'PUT' | 'DELETE'; body?: unknown }): Promise<T> {
  const res = await apiClient.request({
    url: path,
    method: init?.method || 'GET',
    data: init?.body,
  });
  const json = res.data as ApiResponse<T>;
  if (!json?.success) throw new Error(json?.message || 'Erro');
  return json.data;
}

export const RetencaoApi = {
  listarRecursos: () => api<string[]>('/api/v1/retencao/recursos'),

  listarPoliticas: (params?: { recurso?: string; ativo?: string; pagina?: number; limite?: number }) => api<RetencaoPoliticaDTO[]>(`/api/v1/retencao/politicas${qs(params)}`),
  criarPolitica: (body: any) => api<{ id: number }>('/api/v1/retencao/politicas', { method: 'POST', body }),
  atualizarPolitica: (id: number, body: any) => api<{ id: number }>(`/api/v1/retencao/politicas/${id}`, { method: 'PUT', body }),

  listarInventario: (params?: { recurso?: string; status?: string; holdAtivo?: string; elegivel?: string; pagina?: number; limite?: number }) =>
    api<RetencaoItemDTO[]>(`/api/v1/retencao/inventario${qs(params)}`),
  sincronizarInventario: (body: any) => api<any>('/api/v1/retencao/inventario/sincronizar', { method: 'POST', body }),

  listarHolds: () => api<LegalHoldDTO[]>('/api/v1/retencao/legal-holds'),
  criarHold: (body: any) => api<any>('/api/v1/retencao/legal-holds', { method: 'POST', body }),
  liberarHold: (id: number) => api<any>(`/api/v1/retencao/legal-holds/${id}/liberar`, { method: 'POST' }),

  simularDescarte: (body: any) => api<any>('/api/v1/retencao/descarte/simular', { method: 'POST', body }),
  listarLotes: () => api<DescarteLoteDTO[]>('/api/v1/retencao/descarte/lotes'),
  criarLote: (body: any) => api<any>('/api/v1/retencao/descarte/lotes', { method: 'POST', body }),
  obterLote: (id: number) => api<any>(`/api/v1/retencao/descarte/lotes/${id}`),
  aprovarLote: (id: number) => api<any>(`/api/v1/retencao/descarte/lotes/${id}/aprovar`, { method: 'POST' }),
  executarLote: (id: number) => api<any>(`/api/v1/retencao/descarte/lotes/${id}/executar`, { method: 'POST' }),

  listarAuditoria: (params?: { recurso?: string; tipoEvento?: string; pagina?: number; limite?: number }) => api<any[]>(`/api/v1/retencao/auditoria${qs(params)}`),
};

