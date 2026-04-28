import type {
  PresencaDetalheDTO,
  PresencaItemDTO,
  PresencaCabecalhoDTO,
  PresencaProducaoItemDTO,
  PresencaServicoLancadoDTO,
  ProdutividadeLinhaDTO,
  StatusPresenca,
  TipoLocalPresenca,
} from './types';

type ApiResponse<T> = { success: boolean; message?: string; data: T; meta?: Record<string, unknown> };

async function api<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const res = await fetch(input, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
    cache: 'no-store',
  });
  const json = (await res.json().catch(() => null)) as ApiResponse<T> | null;
  if (!res.ok || !json?.success) throw new Error(json?.message || 'Erro na requisição');
  return json.data;
}

export const PresencasApi = {
  politica: () =>
    api<{ exigirAutorizacaoDispositivo: boolean; bloquearPorTreinamentoVencido: boolean; exigirGeolocalizacao: boolean; exigirFoto: boolean }>(
      `/api/v1/rh/presencas/politica`
    ),

  autorizacao: () => api<{ autorizado: boolean; termoVersao: string | null; aceitoEm: string | null }>(`/api/v1/rh/presencas/autorizacao`),

  aceitarTermo: (payload: { termoVersao: string; deviceUuid?: string | null; plataforma?: string | null }) =>
    api<{ autorizado: boolean; termoVersao: string; aceitoEm: string }>(`/api/v1/rh/presencas/autorizacao`, { method: 'POST', body: JSON.stringify(payload) }),

  listar: (params?: { status?: StatusPresenca | ''; data?: string | '' }) => {
    const sp = new URLSearchParams();
    if (params?.status) sp.set('status', params.status);
    if (params?.data) sp.set('data', params.data);
    const qs = sp.toString();
    return api<PresencaCabecalhoDTO[]>(`/api/v1/rh/presencas${qs ? `?${qs}` : ''}`);
  },

  criar: (payload: { tipoLocal: TipoLocalPresenca; idObra?: number | null; idUnidade?: number | null; dataReferencia: string; turno?: string; observacao?: string | null }) =>
    api<{ id: number }>(`/api/v1/rh/presencas`, { method: 'POST', body: JSON.stringify(payload) }),

  obter: (id: number) => api<PresencaDetalheDTO>(`/api/v1/rh/presencas/${id}`),

  upsertItem: (idPresenca: number, payload: Partial<PresencaItemDTO> & { idFuncionario: number; situacaoPresenca: string }) =>
    api<{ id: number }>(`/api/v1/rh/presencas/${idPresenca}/itens`, { method: 'POST', body: JSON.stringify(payload) }),

  assinarItem: (
    idPresencaItem: number,
    payload: {
      idFuncionarioSignatario: number;
      tipoAssinatura: string;
      pin?: string;
      latitude?: number;
      longitude?: number;
      hashDocumento?: string;
      arquivoAssinaturaUrl?: string;
      observacao?: string;
      metadataJson?: unknown;
    }
  ) => api<{ idAssinatura: number }>(`/api/v1/rh/presencas/itens/${idPresencaItem}/assinar`, { method: 'POST', body: JSON.stringify(payload) }),

  acao: (idPresenca: number, payload: { acao: 'FECHAR' | 'ENVIAR_RH' | 'RECEBER_RH' | 'REJEITAR_RH'; motivo?: string }) =>
    api<{ id: number; status: StatusPresenca }>(`/api/v1/rh/presencas/${idPresenca}/acoes`, { method: 'POST', body: JSON.stringify(payload) }),

  obterProducao: (idPresenca: number) => api<PresencaProducaoItemDTO[]>(`/api/v1/rh/presencas/${idPresenca}/producao`),

  salvarProducao: (
    idPresenca: number,
    payload: { itens: Array<{ idPresencaItem: number; quantidadeExecutada: number; unidadeMedida?: string | null; servicos?: Array<string | PresencaServicoLancadoDTO> | null }> }
  ) =>
    api<{ idPresenca: number }>(`/api/v1/rh/presencas/${idPresenca}/producao`, { method: 'PUT', body: JSON.stringify(payload) }),

  equipeObra: (idObra: number) => api<any[]>(`/api/v1/rh/obras/equipe?idObra=${idObra}`),

  produtividadeObra: (params: { idObra: number; competencia: string }) =>
    api<ProdutividadeLinhaDTO[]>(`/api/v1/rh/obras/produtividade?idObra=${params.idObra}&competencia=${encodeURIComponent(params.competencia)}`),
};
