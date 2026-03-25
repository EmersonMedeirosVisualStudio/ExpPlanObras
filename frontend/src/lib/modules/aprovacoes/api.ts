import type {
  AprovacaoModeloDTO,
  AprovacaoModeloEtapaDTO,
  AprovacaoModeloSaveDTO,
  AprovacaoSolicitacaoDTO,
  AprovacaoSolicitacaoDetalheDTO,
  AssinaturaInputDTO,
  MinhaAprovacaoPendenteDTO,
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

export const AprovacoesApi = {
  listarModelos: () => api<AprovacaoModeloDTO[]>('/api/v1/aprovacoes/modelos'),
  obterModelo: (id: number) => api<{ modelo: AprovacaoModeloDTO; etapas: AprovacaoModeloEtapaDTO[] }>(`/api/v1/aprovacoes/modelos/${id}`),
  criarModelo: (body: AprovacaoModeloSaveDTO) => api<{ id: number }>('/api/v1/aprovacoes/modelos', { method: 'POST', body: JSON.stringify(body) }),
  atualizarModelo: (id: number, body: AprovacaoModeloSaveDTO) =>
    api<void>(`/api/v1/aprovacoes/modelos/${id}`, { method: 'PUT', body: JSON.stringify(body) }),

  criarSolicitacao: (body: { entidadeTipo: string; entidadeId: number; idModelo?: number | null }) =>
    api<{ id: number }>('/api/v1/aprovacoes/solicitacoes', { method: 'POST', body: JSON.stringify(body) }),
  listarSolicitacoes: (params?: { status?: string; minhas?: boolean; limit?: number }) =>
    api<AprovacaoSolicitacaoDTO[]>(`/api/v1/aprovacoes/solicitacoes${qs(params as any)}`),
  obterSolicitacao: (id: number) => api<AprovacaoSolicitacaoDetalheDTO>(`/api/v1/aprovacoes/solicitacoes/${id}`),
  enviarSolicitacao: (id: number) => api<void>(`/api/v1/aprovacoes/solicitacoes/${id}/acoes`, { method: 'POST', body: JSON.stringify({ acao: 'ENVIAR' }) }),
  decidir: (id: number, body: { acao: 'APROVAR' | 'REJEITAR' | 'DEVOLVER'; parecer?: string; assinatura?: AssinaturaInputDTO }) =>
    api<void>(`/api/v1/aprovacoes/solicitacoes/${id}/acoes`, { method: 'POST', body: JSON.stringify(body) }),

  minhasPendencias: () => api<MinhaAprovacaoPendenteDTO[]>('/api/v1/aprovacoes/minhas-pendencias'),

  habilitarPin: (pin: string) => api<void>('/api/v1/aprovacoes/habilitacao-assinatura', { method: 'POST', body: JSON.stringify({ tipo: 'PIN', pin }) }),
};

