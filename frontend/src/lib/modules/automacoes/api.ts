import type {
  AutomacaoExecucaoDTO,
  PendenciaOcorrenciaDTO,
  SlaPoliticaDTO,
  SlaPoliticaSaveDTO,
  TarefaInstanciaDTO,
  TarefaRecorrenteModeloDTO,
  TarefaRecorrenteModeloSaveDTO,
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

export const AutomacoesApi = {
  listarModelos: () => api<TarefaRecorrenteModeloDTO[]>('/api/v1/automacoes/tarefas-modelos'),
  criarModelo: (body: TarefaRecorrenteModeloSaveDTO) =>
    api<{ id: number }>('/api/v1/automacoes/tarefas-modelos', { method: 'POST', body: JSON.stringify(body) }),
  atualizarModelo: (id: number, body: TarefaRecorrenteModeloSaveDTO) =>
    api<void>(`/api/v1/automacoes/tarefas-modelos/${id}`, { method: 'PUT', body: JSON.stringify(body) }),

  listarInstancias: (params?: { status?: string; userId?: number; limit?: number }) =>
    api<TarefaInstanciaDTO[]>(`/api/v1/automacoes/tarefas-instancias${qs(params as any)}`),
  alterarStatusInstancia: (id: number, acao: 'INICIAR' | 'CONCLUIR' | 'CANCELAR', observacao?: string) =>
    api<void>(`/api/v1/automacoes/tarefas-instancias/${id}/status`, { method: 'POST', body: JSON.stringify({ acao, observacao }) }),

  listarPoliticas: () => api<SlaPoliticaDTO[]>('/api/v1/automacoes/sla-politicas'),
  criarPolitica: (body: SlaPoliticaSaveDTO) =>
    api<{ id: number }>('/api/v1/automacoes/sla-politicas', { method: 'POST', body: JSON.stringify(body) }),
  atualizarPolitica: (id: number, body: SlaPoliticaSaveDTO) =>
    api<void>(`/api/v1/automacoes/sla-politicas/${id}`, { method: 'PUT', body: JSON.stringify(body) }),

  listarOcorrencias: (params?: { status?: string; modulo?: string; severidade?: string; vencidas?: boolean; limit?: number }) =>
    api<PendenciaOcorrenciaDTO[]>(`/api/v1/automacoes/ocorrencias${qs(params as any)}`),

  listarExecucoes: () => api<AutomacaoExecucaoDTO[]>('/api/v1/automacoes/execucoes'),

  executarAgora: (tipo: 'TAREFAS' | 'SLA' | 'COBRANCA') =>
    api<void>('/api/v1/automacoes/executar-agora', { method: 'POST', body: JSON.stringify({ tipo }) }),
};

