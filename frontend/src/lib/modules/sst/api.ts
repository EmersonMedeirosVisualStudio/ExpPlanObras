import type { SstChecklistExecucaoDTO, SstChecklistExecucaoDetalheDTO, SstChecklistModeloDTO, SstProfissionalDTO } from './types';

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

export const SstApi = {
  listarTecnicos: () => api<SstProfissionalDTO[]>('/api/v1/sst/tecnicos'),
  criarTecnico: (payload: { idFuncionario: number; tipoProfissional: string; registroNumero?: string | null; registroUf?: string | null; conselhoSigla?: string | null }) =>
    api<{ id: number }>('/api/v1/sst/tecnicos', { method: 'POST', body: JSON.stringify(payload) }),
  atualizarTecnico: (id: number, payload: { tipoProfissional: string; registroNumero?: string | null; registroUf?: string | null; conselhoSigla?: string | null; ativo: boolean }) =>
    api<{ id: number }>(`/api/v1/sst/tecnicos/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  adicionarAlocacaoTecnico: (id: number, payload: { tipoLocal: string; idObra?: number | null; idUnidade?: number | null; dataInicio: string; dataFim?: string | null; principal?: boolean; observacao?: string | null }) =>
    api<{ id: number }>(`/api/v1/sst/tecnicos/${id}/alocacoes`, { method: 'POST', body: JSON.stringify(payload) }),

  listarModelos: () => api<SstChecklistModeloDTO[]>('/api/v1/sst/checklists/modelos'),
  criarModelo: (payload: any) => api<{ id: number }>('/api/v1/sst/checklists/modelos', { method: 'POST', body: JSON.stringify(payload) }),

  listarExecucoes: () => api<SstChecklistExecucaoDTO[]>('/api/v1/sst/checklists/execucoes'),
  criarExecucao: (payload: any) => api<{ id: number }>('/api/v1/sst/checklists/execucoes', { method: 'POST', body: JSON.stringify(payload) }),
  obterExecucao: (id: number) => api<SstChecklistExecucaoDetalheDTO>(`/api/v1/sst/checklists/execucoes/${id}`),
  salvarItensExecucao: (id: number, payload: { itens: any[] }) => api<{ id: number }>(`/api/v1/sst/checklists/execucoes/${id}/itens`, { method: 'POST', body: JSON.stringify(payload) }),
  finalizarExecucao: (id: number, payload: any) => api<any>(`/api/v1/sst/checklists/execucoes/${id}/finalizar`, { method: 'POST', body: JSON.stringify(payload) }),
};

