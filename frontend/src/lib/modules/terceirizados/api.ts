import type { TerceirizadoResumoDTO } from './types';

type ApiResponse<T> = {
  success: boolean;
  message?: string;
  data: T;
  meta?: Record<string, unknown>;
};

async function api<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const res = await fetch(input, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
    cache: 'no-store',
  });

  const json = (await res.json().catch(() => null)) as ApiResponse<T> | null;
  if (!res.ok || !json?.success) throw new Error(json?.message || 'Erro na requisição');
  return json.data;
}

export const TerceirizadosApi = {
  listar: (q = '') => api<TerceirizadoResumoDTO[]>(`/api/v1/rh/terceirizados?q=${encodeURIComponent(q)}`),

  criar: (payload: { nomeCompleto: string; funcao?: string | null; ativo?: boolean; idEmpresaParceira?: number | null }) =>
    api<{ id: number }>(`/api/v1/rh/terceirizados`, { method: 'POST', body: JSON.stringify(payload) }),
};

