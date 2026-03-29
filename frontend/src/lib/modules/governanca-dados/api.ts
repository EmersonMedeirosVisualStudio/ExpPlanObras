import apiClient from '@/lib/api';
import type { GovernancaAtivoDTO, GovernancaCampoDTO, GovernancaDominioDTO, GovernancaLineageDTO, GovernancaQualidadeIssueDTO, GovernancaQualidadeRegraDTO } from './types';

type ApiResponse<T> = { success: boolean; message?: string; data: T; meta?: any };

function qs(params?: Record<string, unknown>) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params || {})) {
    if (v === undefined || v === null || v === '') continue;
    p.set(k, String(v));
  }
  return p.toString() ? `?${p.toString()}` : '';
}

async function api<T>(path: string, init?: { method?: 'GET' | 'POST' | 'PUT' | 'DELETE'; body?: unknown }): Promise<T> {
  const res = await apiClient.request({
    url: path,
    method: init?.method || 'GET',
    data: init?.body,
  });
  const json = res.data as ApiResponse<T>;
  if (!json?.success) throw new Error(json?.message || 'Erro');
  return json.data;
}

export const GovernancaDadosApi = {
  sincronizarCatalogo: () => api<{ dominios: string[]; ativos: Array<{ codigoAtivo: string; ativoId: number }> }>('/api/v1/governanca-dados/sincronizar', { method: 'POST' }),

  listarDominios: () => api<GovernancaDominioDTO[]>('/api/v1/governanca-dados/dominios'),
  criarDominio: (body: { codigoDominio: string; nomeDominio: string; descricaoDominio?: string | null }) =>
    api<{ id: number }>('/api/v1/governanca-dados/dominios', { method: 'POST', body }),

  listarAtivos: (params?: { tipo?: string; dominio?: string; pagina?: number; limite?: number }) => api<GovernancaAtivoDTO[]>(`/api/v1/governanca-dados/ativos${qs(params)}`),
  criarAtivo: (body: {
    codigoAtivo: string;
    nomeAtivo: string;
    tipoAtivo: string;
    dominioCodigo?: string | null;
    classificacaoGlobal?: string;
    criticidadeNegocio?: string;
    schemaNome?: string | null;
    objetoNome?: string | null;
    datasetKey?: string | null;
    origemSistema?: string | null;
  }) => api<{ id: number }>('/api/v1/governanca-dados/ativos', { method: 'POST', body }),
  obterAtivo: (id: number) => api<any>(`/api/v1/governanca-dados/ativos/${id}`),

  listarCampos: (id: number) => api<GovernancaCampoDTO[]>(`/api/v1/governanca-dados/ativos/${id}/campos`),
  salvarCampo: (id: number, body: any) => api<any>(`/api/v1/governanca-dados/ativos/${id}/campos`, { method: 'POST', body }),

  listarLineage: (id: number) => api<GovernancaLineageDTO[]>(`/api/v1/governanca-dados/ativos/${id}/lineage`),
  criarLineage: (body: any) => api<{ id: number }>('/api/v1/governanca-dados/lineage', { method: 'POST', body }),

  listarGlossario: (params?: { termo?: string; dominio?: string; pagina?: number; limite?: number }) => api<any[]>(`/api/v1/governanca-dados/glossario${qs(params)}`),
  criarTermo: (body: any) => api<{ id: number }>('/api/v1/governanca-dados/glossario', { method: 'POST', body }),

  listarRegras: (params?: { ativoId?: number; pagina?: number; limite?: number }) => api<GovernancaQualidadeRegraDTO[]>(`/api/v1/governanca-dados/qualidade/regras${qs(params)}`),
  criarRegra: (body: any) => api<{ id: number }>('/api/v1/governanca-dados/qualidade/regras', { method: 'POST', body }),
  atualizarRegra: (id: number, body: any) => api<{ id: number }>(`/api/v1/governanca-dados/qualidade/regras/${id}`, { method: 'PUT', body }),
  executarRegra: (id: number) => api<any>(`/api/v1/governanca-dados/qualidade/regras/${id}/executar`, { method: 'POST' }),

  listarIssues: (params?: { status?: string; severidade?: string; pagina?: number; limite?: number }) => api<GovernancaQualidadeIssueDTO[]>(`/api/v1/governanca-dados/qualidade/issues${qs(params)}`),

  simular: (body: { ativoId: number }) => api<any>('/api/v1/governanca-dados/simular', { method: 'POST', body }),

  executarPiiScan: (body: { ativoId: number; sampleSize?: number | null }) => api<any>('/api/v1/governanca-dados/pii-scans', { method: 'POST', body }),
  listarPiiScans: (params?: { status?: string; pagina?: number; limite?: number }) => api<any[]>(`/api/v1/governanca-dados/pii-scans${qs(params)}`),
  listarPiiResultados: (scanId: number) => api<any[]>(`/api/v1/governanca-dados/pii-scans/${scanId}/resultados`),

  listarSugestoesClassificacao: (params?: { status?: string; pagina?: number; limite?: number }) => api<any[]>(`/api/v1/governanca-dados/classificacao/sugestoes${qs(params)}`),
  aceitarSugestaoClassificacao: (id: number) => api<any>(`/api/v1/governanca-dados/classificacao/sugestoes/${id}/aceitar`, { method: 'POST' }),
  rejeitarSugestaoClassificacao: (id: number, body?: { motivo?: string | null }) =>
    api<any>(`/api/v1/governanca-dados/classificacao/sugestoes/${id}/rejeitar`, { method: 'POST', body }),
};

