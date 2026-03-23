import type { CargoDTO, FuncionarioSelectDTO, OcupacaoDTO, OrganogramaEstruturaDTO, PosicaoDTO, SetorDTO, VinculoDTO } from './types';

type ApiResponse<T> = {
  success: boolean;
  message?: string;
  data: T;
};

async function api<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const res = await fetch(input, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
    cache: 'no-store',
  });

  const json = (await res.json().catch(() => null)) as ApiResponse<T> | null;
  if (!res.ok || !json?.success) throw new Error(json?.message || 'Erro na requisição');
  return json.data;
}

export const OrganogramaApi = {
  obterEstrutura: () => api<OrganogramaEstruturaDTO>('/api/v1/organograma/estrutura'),

  listarFuncionariosSelect: () => api<FuncionarioSelectDTO[]>('/api/v1/apoio/funcionarios-select'),

  criarSetor: (payload: { nomeSetor: string; tipoSetor?: string | null; idSetorPai?: number | null }) =>
    api<SetorDTO>('/api/v1/organograma/setores', { method: 'POST', body: JSON.stringify(payload) }),

  atualizarSetor: (id: number, payload: { nomeSetor: string; tipoSetor?: string | null; idSetorPai?: number | null; ativo: boolean }) =>
    api<SetorDTO>(`/api/v1/organograma/setores/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),

  criarCargo: (payload: { nomeCargo: string }) => api<CargoDTO>('/api/v1/organograma/cargos', { method: 'POST', body: JSON.stringify(payload) }),

  atualizarCargo: (id: number, payload: { nomeCargo: string; ativo: boolean }) =>
    api<CargoDTO>(`/api/v1/organograma/cargos/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),

  criarPosicao: (payload: { idSetor: number; idCargo: number; tituloExibicao: string; ordemExibicao?: number }) =>
    api<PosicaoDTO>('/api/v1/organograma/posicoes', { method: 'POST', body: JSON.stringify(payload) }),

  atualizarPosicao: (id: number, payload: { idSetor: number; idCargo: number; tituloExibicao: string; ordemExibicao: number; ativo: boolean }) =>
    api<PosicaoDTO>(`/api/v1/organograma/posicoes/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),

  criarVinculo: (payload: { idPosicaoSuperior: number; idPosicaoSubordinada: number }) =>
    api<VinculoDTO>('/api/v1/organograma/vinculos', { method: 'POST', body: JSON.stringify(payload) }),

  removerVinculo: (id: number) => api<{ id: number }>(`/api/v1/organograma/vinculos/${id}`, { method: 'DELETE' }),

  ocuparPosicao: (payload: { idFuncionario: number; idPosicao: number; dataInicio: string }) =>
    api<OcupacaoDTO>('/api/v1/organograma/ocupacoes', { method: 'POST', body: JSON.stringify(payload) }),
};
