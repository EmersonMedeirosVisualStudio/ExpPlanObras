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

export const SstTreinamentosApi = {
  listarModelos: () => api<any[]>('/api/v1/sst/treinamentos/modelos'),
  criarModelo: (payload: any) => api<any>('/api/v1/sst/treinamentos/modelos', { method: 'POST', body: JSON.stringify(payload) }),
  listarTurmas: () => api<any[]>('/api/v1/sst/treinamentos/turmas'),
  criarTurma: (payload: any) => api<any>('/api/v1/sst/treinamentos/turmas', { method: 'POST', body: JSON.stringify(payload) }),
  obterTurma: (id: number) => api<any>(`/api/v1/sst/treinamentos/turmas/${id}`),
  adicionarParticipante: (idTurma: number, payload: any) =>
    api<any>(`/api/v1/sst/treinamentos/turmas/${idTurma}/participantes`, { method: 'POST', body: JSON.stringify(payload) }),
  assinarParticipante: (idParticipante: number, payload: any) =>
    api<any>(`/api/v1/sst/treinamentos/participantes/${idParticipante}/assinar`, { method: 'POST', body: JSON.stringify(payload) }),
  finalizarTurma: (idTurma: number, payload: any) => api<any>(`/api/v1/sst/treinamentos/turmas/${idTurma}/finalizar`, { method: 'POST', body: JSON.stringify(payload) }),
  listarVencimentos: () => api<any[]>('/api/v1/sst/treinamentos/vencimentos'),
};
