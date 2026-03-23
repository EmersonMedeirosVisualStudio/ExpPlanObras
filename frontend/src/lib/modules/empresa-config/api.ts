import type { ConfiguracaoEmpresaDTO, FuncionarioSelectDTO } from './types';

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
    cache: 'no-store',
  });

  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.success) throw new Error(json?.message || 'Erro na requisição');
  return json.data as T;
}

export const EmpresaConfigApi = {
  obterConfiguracao: () => api<ConfiguracaoEmpresaDTO>('/api/v1/empresa/configuracao'),

  atualizarRepresentante: (payload: { nome: string; cpf: string; email?: string | null; telefone?: string | null; idFuncionario?: number | null }) =>
    api<{ id: number }>('/api/v1/empresa/representante', { method: 'PUT', body: JSON.stringify(payload) }),

  definirEncarregado: (payload: { idFuncionario: number }) =>
    api<{ id: number }>('/api/v1/empresa/encarregado-sistema', { method: 'PUT', body: JSON.stringify(payload) }),

  listarFuncionariosSelect: () => api<FuncionarioSelectDTO[]>('/api/v1/apoio/funcionarios-select'),
};
