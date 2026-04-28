import type {
  FuncionarioDetalheDTO,
  FuncionarioEnderecoDTO,
  FuncionarioEventoDTO,
  FuncionarioHistoricoEventoDTO,
  FuncionarioHoraExtraDTO,
  FuncionarioJornadaDTO,
  FuncionarioLotacaoDTO,
  FuncionarioResumoDTO,
  FuncionarioSupervisaoDTO,
} from './types';

type ApiResponse<T> = {
  success: boolean;
  message?: string;
  data: T;
  meta?: Record<string, unknown>;
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

export type FuncionarioCriarPayload = {
  matricula?: string | null;
  nomeCompleto: string;
  cpf: string;
  dataNascimento?: string | null;
  rg?: string | null;
  titulo?: string | null;
  nomeMae?: string | null;
  nomePai?: string | null;
  cargoContratual?: string | null;
  funcaoPrincipal?: string | null;
  tipoVinculo?: string | null;
  telefonePrincipal?: string | null;
  dataAdmissao?: string | null;
  ativo?: boolean;
};

export const FuncionariosApi = {
  listar: (q = '', params?: { limit?: number; idObra?: number; idContrato?: number }) => {
    const limit = typeof params?.limit === 'number' ? `&limit=${encodeURIComponent(String(params.limit))}` : '';
    const idObra = typeof params?.idObra === 'number' && params.idObra > 0 ? `&idObra=${encodeURIComponent(String(params.idObra))}` : '';
    const idContrato =
      typeof params?.idContrato === 'number' && params.idContrato > 0 ? `&idContrato=${encodeURIComponent(String(params.idContrato))}` : '';
    return api<FuncionarioResumoDTO[]>(`/api/v1/rh/funcionarios?q=${encodeURIComponent(q)}${limit}${idObra}${idContrato}`);
  },

  obter: (id: number) => api<FuncionarioDetalheDTO>(`/api/v1/rh/funcionarios/${id}`),

  historico: (id: number) => api<FuncionarioHistoricoEventoDTO[]>(`/api/v1/rh/funcionarios/${id}/historico`),

  eventos: (id: number) => api<FuncionarioEventoDTO[]>(`/api/v1/rh/funcionarios/${id}/eventos`),

  criar: (payload: FuncionarioCriarPayload) =>
    api<FuncionarioDetalheDTO>(`/api/v1/rh/funcionarios`, { method: 'POST', body: JSON.stringify(payload) }),

  atualizar: (id: number, payload: Partial<FuncionarioDetalheDTO>) =>
    api<FuncionarioDetalheDTO>(`/api/v1/rh/funcionarios/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),

  endossar: (id: number, payload: { acao: 'APROVAR' | 'REJEITAR'; motivo?: string }) =>
    api<{ id: number; acao: 'APROVAR' | 'REJEITAR' }>(`/api/v1/rh/funcionarios/${id}/endosso`, { method: 'POST', body: JSON.stringify(payload) }),

  adicionarLotacao: (idFuncionario: number, payload: Omit<FuncionarioLotacaoDTO, 'id' | 'dataFim' | 'atual'>) =>
    api<{ id: number }>(`/api/v1/rh/funcionarios/${idFuncionario}/lotacoes`, { method: 'POST', body: JSON.stringify(payload) }),

  adicionarSupervisao: (idFuncionario: number, payload: { idSupervisorFuncionario: number; dataInicio: string; observacao?: string | null }) =>
    api<{ id: number }>(`/api/v1/rh/funcionarios/${idFuncionario}/supervisao`, { method: 'POST', body: JSON.stringify(payload) }),

  adicionarJornada: (idFuncionario: number, payload: Omit<FuncionarioJornadaDTO, 'id' | 'dataFim' | 'atual'>) =>
    api<{ id: number }>(`/api/v1/rh/funcionarios/${idFuncionario}/jornadas`, { method: 'POST', body: JSON.stringify(payload) }),

  listarHorasExtras: (idFuncionario?: number) =>
    api<FuncionarioHoraExtraDTO[]>(`/api/v1/rh/horas-extras${idFuncionario ? `?idFuncionario=${idFuncionario}` : ''}`),

  criarHoraExtra: (payload: {
    idFuncionario: number;
    dataReferencia: string;
    quantidadeMinutos: number;
    tipoHoraExtra: string;
    motivo?: string | null;
    idObra?: number | null;
    idUnidade?: number | null;
  }) => api<{ id: number }>(`/api/v1/rh/horas-extras`, { method: 'POST', body: JSON.stringify(payload) }),

  lancarHoraExtra: (payload: {
    idFuncionario: number;
    dataReferencia: string;
    quantidadeMinutos: number;
    tipoHoraExtra: string;
    motivo?: string | null;
    idObra?: number | null;
    idUnidade?: number | null;
  }) => api<{ id: number }>(`/api/v1/rh/horas-extras`, { method: 'POST', body: JSON.stringify(payload) }),

  processarHoraExtra: (idHoraExtra: number, payload: { statusHe: string; observacao?: string | null }) =>
    api<null>(`/api/v1/rh/horas-extras/${idHoraExtra}/processar`, { method: 'PATCH', body: JSON.stringify(payload) }),

  listarEnderecos: (idFuncionario: number) => api<FuncionarioEnderecoDTO[]>(`/api/v1/rh/funcionarios/${idFuncionario}/enderecos`),

  criarEndereco: (idFuncionario: number, payload: Omit<FuncionarioEnderecoDTO, 'id' | 'idFuncionario' | 'criadoEm' | 'atualizadoEm'>) =>
    api<{ id: number }>(`/api/v1/rh/funcionarios/${idFuncionario}/enderecos`, { method: 'POST', body: JSON.stringify(payload) }),

  atualizarEndereco: (
    idFuncionario: number,
    idEndereco: number,
    payload: Partial<Omit<FuncionarioEnderecoDTO, 'id' | 'idFuncionario' | 'criadoEm' | 'atualizadoEm'>>
  ) =>
    api<null>(`/api/v1/rh/funcionarios/${idFuncionario}/enderecos/${idEndereco}`, { method: 'PUT', body: JSON.stringify(payload) }),

  excluirEndereco: (idFuncionario: number, idEndereco: number) =>
    api<null>(`/api/v1/rh/funcionarios/${idFuncionario}/enderecos/${idEndereco}`, { method: 'DELETE' }),
};
