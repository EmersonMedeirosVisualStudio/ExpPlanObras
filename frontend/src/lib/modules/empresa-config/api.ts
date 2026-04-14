import type { ConfiguracaoEmpresaDTO, FuncionarioSelectDTO } from './types';
import { api } from '@/lib/api';

async function request<T>(method: 'get' | 'post' | 'put' | 'delete', url: string, data?: any): Promise<T> {
  try {
    const res = await api[method](url, data);
    return res.data?.data as T;
  } catch (error: any) {
    throw new Error(error.response?.data?.message || error.message || 'Erro na requisição');
  }
}

export const EmpresaConfigApi = {
  obterConfiguracao: () => request<ConfiguracaoEmpresaDTO>('get', '/api/v1/empresa/configuracao'),

  atualizarRepresentante: (payload: { nome: string; cpf: string; email?: string | null; telefone?: string | null; idFuncionario?: number | null }) =>
    request<{ id: number }>('put', '/api/v1/empresa/representante', payload),

  definirEncarregado: (payload: { idFuncionario: number }) =>
    request<{ id: number }>('put', '/api/v1/empresa/encarregado-sistema', payload),

  definirTitular: (payload: { roleCode: 'CEO' | 'GERENTE_RH'; idFuncionario: number }) =>
    request<{ id: number }>('put', '/api/v1/empresa/titulares', payload),

  criarFuncionarioSimples: (payload: { nomeCompleto: string; email?: string | null; cargo?: string | null }) =>
    request<{ id: number; nome: string }>('post', '/api/v1/apoio/funcionarios-simples', payload),

  listarFuncionariosSelect: () => request<FuncionarioSelectDTO[]>('get', '/api/v1/apoio/funcionarios-select'),
};
