import type {
  WorkflowAcaoExecuteDTO,
  WorkflowHistoricoDTO,
  WorkflowInstanciaDTO,
  WorkflowInstanciaDetalheDTO,
  WorkflowModeloDTO,
  WorkflowModeloSaveDTO,
  WorkflowTransicaoDisponivelDTO,
} from './types';

type ApiResponse<T> = { success: boolean; message?: string; data: T };

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    cache: 'no-store',
  });
  const json = (await res.json().catch(() => null)) as ApiResponse<T> | null;
  if (!res.ok || !json?.success) throw new Error(json?.message || 'Erro na requisição');
  return json.data;
}

function qs(params?: Record<string, string | number | boolean | undefined | null>) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params || {})) {
    if (v === undefined || v === null || v === '') continue;
    p.set(k, String(v));
  }
  const s = p.toString();
  return s ? `?${s}` : '';
}

export const WorkflowsApi = {
  listarModelos: () => api<WorkflowModeloDTO[]>('/api/v1/workflows/modelos'),
  obterModelo: (id: number) => api<any>(`/api/v1/workflows/modelos/${id}`),
  criarModelo: (body: WorkflowModeloSaveDTO) => api<{ id: number }>('/api/v1/workflows/modelos', { method: 'POST', body: JSON.stringify(body) }),
  atualizarModelo: (id: number, body: WorkflowModeloSaveDTO) =>
    api<{ id: number }>(`/api/v1/workflows/modelos/${id}`, { method: 'PUT', body: JSON.stringify(body) }),

  criarInstancia: (body: { entidadeTipo: string; entidadeId: number; idModelo?: number | null }) =>
    api<{ id: number }>('/api/v1/workflows/instancias', { method: 'POST', body: JSON.stringify(body) }),
  listarInstancias: (params?: { status?: string; entidadeTipo?: string; minhas?: boolean; limit?: number }) =>
    api<WorkflowInstanciaDTO[]>(`/api/v1/workflows/instancias${qs(params as any)}`),
  obterInstancia: (id: number) => api<WorkflowInstanciaDetalheDTO>(`/api/v1/workflows/instancias/${id}`),
  listarTransicoes: (id: number) => api<WorkflowTransicaoDisponivelDTO[]>(`/api/v1/workflows/instancias/${id}/transicoes`),
  executarTransicao: (id: number, body: WorkflowAcaoExecuteDTO) =>
    api<void>(`/api/v1/workflows/instancias/${id}/executar`, { method: 'POST', body: JSON.stringify(body) }),
  listarHistorico: (id: number) => api<WorkflowHistoricoDTO[]>(`/api/v1/workflows/instancias/${id}/historico`),

  minhasTarefas: () => api<any[]>('/api/v1/workflows/minhas-tarefas'),
};

