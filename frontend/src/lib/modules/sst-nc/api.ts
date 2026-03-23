import type { SstNcDetalheDTO, SstNcDTO } from './types';

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

export const SstNcApi = {
  listar: () => api<SstNcDTO[]>('/api/v1/sst/nao-conformidades'),
  criar: (payload: any) => api<{ id: number }>('/api/v1/sst/nao-conformidades', { method: 'POST', body: JSON.stringify(payload) }),
  obter: (id: number) => api<SstNcDetalheDTO>(`/api/v1/sst/nao-conformidades/${id}`),
  criarAcao: (idNc: number, payload: any) => api<{ id: number }>(`/api/v1/sst/nao-conformidades/${idNc}/acoes`, { method: 'POST', body: JSON.stringify(payload) }),
  alterarStatusNc: (idNc: number, payload: any) => api<any>(`/api/v1/sst/nao-conformidades/${idNc}/status`, { method: 'POST', body: JSON.stringify(payload) }),
  alterarStatusAcao: (idAcao: number, payload: any) => api<any>(`/api/v1/sst/nao-conformidades/acoes/${idAcao}/status`, { method: 'POST', body: JSON.stringify(payload) }),
};

