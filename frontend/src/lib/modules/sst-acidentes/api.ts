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

export const SstAcidentesApi = {
  listar: () => api<any[]>('/api/v1/sst/acidentes'),
  criar: (payload: any) => api<{ id: number }>('/api/v1/sst/acidentes', { method: 'POST', body: JSON.stringify(payload) }),
  obter: (id: number) => api<any>(`/api/v1/sst/acidentes/${id}`),

  adicionarEnvolvido: (id: number, payload: any) =>
    api<{ id: number }>(`/api/v1/sst/acidentes/${id}/envolvidos`, { method: 'POST', body: JSON.stringify(payload) }),
  adicionarTestemunha: (id: number, payload: any) =>
    api<{ id: number }>(`/api/v1/sst/acidentes/${id}/testemunhas`, { method: 'POST', body: JSON.stringify(payload) }),

  salvarInvestigacao: (id: number, payload: any) =>
    api<{ id: number }>(`/api/v1/sst/acidentes/${id}/investigacao`, { method: 'POST', body: JSON.stringify(payload) }),

  registrarCat: (id: number, payload: any) => api<{ id: number }>(`/api/v1/sst/acidentes/${id}/cat`, { method: 'POST', body: JSON.stringify(payload) }),

  alterarStatus: (id: number, payload: any) => api<any>(`/api/v1/sst/acidentes/${id}/status`, { method: 'POST', body: JSON.stringify(payload) }),
};
