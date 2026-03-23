import type { EpiCatalogoDTO, EpiFichaDetalheDTO, EpiFichaResumoDTO, ResultadoInspecao, StatusFichaEpi, TipoDestinatario, TipoLocal } from './types';

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

export const EpiApi = {
  listarCatalogo: (q = '') => api<EpiCatalogoDTO[]>(`/api/v1/sst/epi/catalogo${q ? `?q=${encodeURIComponent(q)}` : ''}`),
  criarCatalogo: (payload: Partial<EpiCatalogoDTO> & { nomeEpi: string; categoriaEpi: string }) =>
    api<{ id: number }>(`/api/v1/sst/epi/catalogo`, { method: 'POST', body: JSON.stringify(payload) }),
  atualizarCatalogo: (id: number, payload: Partial<EpiCatalogoDTO> & { nomeEpi: string; categoriaEpi: string }) =>
    api<{ id: number }>(`/api/v1/sst/epi/catalogo/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),

  listarFichas: (params?: { status?: StatusFichaEpi | ''; q?: string | '' }) => {
    const sp = new URLSearchParams();
    if (params?.status) sp.set('status', params.status);
    if (params?.q) sp.set('q', params.q);
    const qs = sp.toString();
    return api<EpiFichaResumoDTO[]>(`/api/v1/sst/epi/fichas${qs ? `?${qs}` : ''}`);
  },
  criarFicha: (payload: {
    tipoDestinatario: TipoDestinatario;
    idFuncionario?: number | null;
    idTerceirizadoTrabalhador?: number | null;
    tipoLocal: TipoLocal;
    idObra?: number | null;
    idUnidade?: number | null;
    dataEmissao: string;
    entregaOrientada?: boolean;
    assinaturaDestinatarioObrigatoria?: boolean;
    observacao?: string | null;
  }) => api<{ id: number }>(`/api/v1/sst/epi/fichas`, { method: 'POST', body: JSON.stringify(payload) }),
  obterFicha: (id: number) => api<EpiFichaDetalheDTO>(`/api/v1/sst/epi/fichas/${id}`),

  entregarItem: (idFicha: number, payload: { idEpi: number; quantidadeEntregue?: number; tamanho?: string | null; dataEntrega: string; excecaoCaVencido?: boolean; motivoMovimentacao?: string | null; observacao?: string | null }) =>
    api<{ id: number }>(`/api/v1/sst/epi/fichas/${idFicha}/itens`, { method: 'POST', body: JSON.stringify(payload) }),
  registrarDevolucao: (
    idItem: number,
    payload: {
      dataDevolucao: string;
      quantidadeDevolvida?: number | null;
      condicaoDevolucao?: string | null;
      higienizado?: boolean;
      motivoMovimentacao?: string | null;
      observacao?: string | null;
    }
  ) => api<{ id: number; status: string }>(`/api/v1/sst/epi/itens/${idItem}/devolucao`, { method: 'POST', body: JSON.stringify(payload) }),
  inspecionar: (idItem: number, payload: { dataInspecao: string; resultado: ResultadoInspecao; observacao?: string | null }) =>
    api<{ id: number }>(`/api/v1/sst/epi/itens/${idItem}/inspecoes`, { method: 'POST', body: JSON.stringify(payload) }),

  assinarFicha: (
    idFicha: number,
    payload: { tipoAssinatura: string; pin?: string; latitude?: number; longitude?: number; arquivoAssinaturaUrl?: string; observacao?: string }
  ) => api<{ idAssinatura: number }>(`/api/v1/sst/epi/fichas/${idFicha}/assinar-destinatario`, { method: 'POST', body: JSON.stringify(payload) }),

  listarTrabalhadores: (tipoLocal: string, idObra?: number, idUnidade?: number) =>
    api<Array<{ tipoDestinatario: 'FUNCIONARIO' | 'TERCEIRIZADO'; id: number; nome: string; funcao?: string | null }>>(
      `/api/v1/sst/trabalhadores-select?tipoLocal=${encodeURIComponent(tipoLocal)}${idObra ? `&idObra=${idObra}` : ''}${idUnidade ? `&idUnidade=${idUnidade}` : ''}`
    ),
};
