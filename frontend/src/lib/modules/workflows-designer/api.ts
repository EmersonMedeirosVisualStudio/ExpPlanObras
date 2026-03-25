import type { WorkflowDesignerGraphDTO, WorkflowDesignerRascunhoDTO, WorkflowDesignerSimulationResult, WorkflowDesignerValidationResult } from './types';

type ApiResponse<T> = { success: boolean; message?: string; data: T };

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) }, cache: 'no-store' });
  const json = (await res.json().catch(() => null)) as ApiResponse<T> | null;
  if (!res.ok || !json?.success) throw new Error(json?.message || 'Erro na requisição');
  return json.data;
}

export const WorkflowsDesignerApi = {
  listarRascunhos: () => api<any[]>('/api/v1/workflows/designer/rascunhos'),
  criarRascunho: (body: { codigo: string; nomeModelo: string; entidadeTipo: string; descricaoModelo?: string | null }) =>
    api<{ id: number }>('/api/v1/workflows/designer/rascunhos', { method: 'POST', body: JSON.stringify(body) }),
  obterRascunho: (id: number) => api<WorkflowDesignerRascunhoDTO>(`/api/v1/workflows/designer/rascunhos/${id}`),
  salvarRascunho: (id: number, graph: WorkflowDesignerGraphDTO, changelogText?: string | null) =>
    api<void>(`/api/v1/workflows/designer/rascunhos/${id}`, { method: 'PUT', body: JSON.stringify({ graph, changelogText }) }),

  lock: (id: number, force?: boolean) => api<void>(`/api/v1/workflows/designer/rascunhos/${id}/lock`, { method: 'POST', body: JSON.stringify({ force: !!force }) }),
  unlock: (id: number, force?: boolean) =>
    api<void>(`/api/v1/workflows/designer/rascunhos/${id}/unlock`, { method: 'POST', body: JSON.stringify({ force: !!force }) }),
  heartbeat: (id: number) => api<void>(`/api/v1/workflows/designer/rascunhos/${id}/heartbeat`, { method: 'POST' }),

  validarRascunho: (id: number) => api<WorkflowDesignerValidationResult>(`/api/v1/workflows/designer/rascunhos/${id}/validar`, { method: 'POST' }),
  simularRascunho: (id: number, contexto: Record<string, unknown>) =>
    api<WorkflowDesignerSimulationResult>(`/api/v1/workflows/designer/rascunhos/${id}/simular`, { method: 'POST', body: JSON.stringify({ contexto }) }),
  publicarRascunho: (id: number, changelogText?: string | null) =>
    api<{ idModeloPublicado: number }>(`/api/v1/workflows/designer/rascunhos/${id}/publicar`, { method: 'POST', body: JSON.stringify({ changelogText }) }),

  duplicarModelo: (id: number) => api<{ id: number }>(`/api/v1/workflows/designer/modelos/${id}/duplicar`, { method: 'POST' }),
  listarPublicacoes: (id: number) => api<any[]>(`/api/v1/workflows/designer/modelos/${id}/publicacoes`),
};

