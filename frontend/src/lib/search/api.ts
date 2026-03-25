import type { GlobalSearchResponseDTO, GlobalSearchSuggestResponseDTO } from './types';

type ApiResponse<T> = { success: boolean; message?: string; data: T };

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
    cache: 'no-store',
  });
  const json = (await res.json().catch(() => null)) as ApiResponse<T> | null;
  if (!res.ok || !json?.success) throw new Error(json?.message || 'Erro na requisição');
  return json.data;
}

export const GlobalSearchApi = {
  buscar: (q: string, modulo?: string) =>
    api<GlobalSearchResponseDTO>(`/api/v1/busca/global?q=${encodeURIComponent(q)}${modulo ? `&modulo=${encodeURIComponent(modulo)}` : ''}`),
  sugestoes: () => api<GlobalSearchSuggestResponseDTO>('/api/v1/busca/sugestoes'),
  registrarQuery: (query: string) =>
    api<void>('/api/v1/busca/registrar-query', { method: 'POST', body: JSON.stringify({ query }) }),
  registrarAcesso: (body: { entidadeTipo?: string; entidadeId?: number; rota: string; titulo: string; modulo: string }) =>
    api<void>('/api/v1/busca/registrar-acesso', { method: 'POST', body: JSON.stringify(body) }),
  reindexar: (body?: { entidadeTipo?: string; entityId?: number; tenantId?: number }) =>
    api<void>('/api/v1/busca/reindexar', { method: 'POST', body: JSON.stringify(body ?? {}) }),
};

