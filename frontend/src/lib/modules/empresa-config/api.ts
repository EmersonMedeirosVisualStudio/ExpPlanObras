import type { ConfiguracaoEmpresaDTO, FuncionarioSelectDTO } from './types';
import { api } from '@/lib/api';

function isNetworkError(error: any) {
  const msg = String(error?.message || '');
  const code = String(error?.code || '');
  return !error?.response && (msg.includes('Network Error') || code === 'ERR_NETWORK' || code === 'ECONNABORTED');
}

async function request<T>(method: 'get' | 'post' | 'put' | 'delete', url: string, data?: any): Promise<T> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await api[method](url, data);
      return res.data?.data as T;
    } catch (error: any) {
      if (attempt === 0 && isNetworkError(error)) {
        await new Promise((r) => setTimeout(r, 1200));
        continue;
      }
      throw new Error(
        error.response?.data?.message ||
          (isNetworkError(error) ? 'Falha de rede ao conectar ao servidor. Aguarde alguns segundos e tente novamente.' : error.message) ||
          'Erro na requisição'
      );
    }
  }
  throw new Error('Erro na requisição');
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

  atualizarDocumentosLayout: (payload: {
    logoDataUrl?: string | null;
    cabecalhoHtml?: string | null;
    rodapeHtml?: string | null;
    cabecalhoAlturaMm?: number | null;
    rodapeAlturaMm?: number | null;
  }) =>
    request<{ ok: true }>('put', '/api/v1/empresa/documentos-layout', payload),
};
