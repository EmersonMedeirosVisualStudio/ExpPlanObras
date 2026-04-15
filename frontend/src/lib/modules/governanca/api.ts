import type { AbrangenciaDTO, PerfilDTO, UsuarioDTO } from './types';
import { api as http } from '@/lib/api';

async function request<T>(method: 'get' | 'post' | 'put' | 'patch', url: string, data?: any): Promise<T> {
  try {
    const res = await http[method](url, data);
    return res.data?.data as T;
  } catch (error: any) {
    throw new Error(error?.response?.data?.message || error?.message || 'Erro na requisição');
  }
}

export const GovernancaApi = {
  listarUsuarios: (q?: string) => request<UsuarioDTO[]>('get', `/api/v1/governanca/usuarios${q ? `?q=${encodeURIComponent(q)}` : ''}`),

  criarUsuario: (payload: { idFuncionario: number; login: string; emailLogin: string; ativo: boolean; bloqueado: boolean }) =>
    request<{ id: number }>('post', `/api/v1/governanca/usuarios`, payload),

  atualizarUsuario: (id: number, payload: { emailLogin: string; ativo: boolean; bloqueado: boolean }) =>
    request<null>('put', `/api/v1/governanca/usuarios/${id}`, payload),

  atualizarStatusUsuario: (id: number, payload: { ativo: boolean; bloqueado: boolean }) =>
    request<null>('patch', `/api/v1/governanca/usuarios/${id}`, payload),

  resetarAcessoUsuario: (id: number) => request<null>('post', `/api/v1/governanca/usuarios/${id}/reset-acesso`),

  atualizarPerfisUsuario: (id: number, perfisIds: number[]) =>
    request<null>('put', `/api/v1/governanca/usuarios/${id}/perfis`, { perfisIds }),

  listarPerfis: () => request<PerfilDTO[]>('get', `/api/v1/governanca/perfis`),

  criarPerfil: (payload: { nome: string; codigo: string; permissoes: { modulo: string; janela: string; acao: string }[] }) =>
    request<{ id: number }>('post', `/api/v1/governanca/perfis`, payload),

  atualizarPerfil: (id: number, payload: { nome: string; codigo: string; ativo: boolean; permissoes: { modulo: string; janela: string; acao: string }[] }) =>
    request<null>('put', `/api/v1/governanca/perfis/${id}`, payload),

  listarAbrangencias: () => request<any[]>('get', `/api/v1/governanca/abrangencias`),

  criarAbrangencia: (payload: AbrangenciaDTO) =>
    request<{ id: number }>('post', `/api/v1/governanca/abrangencias`, payload),

  atualizarAbrangencia: (id: number, payload: AbrangenciaDTO) =>
    request<null>('put', `/api/v1/governanca/abrangencias/${id}`, payload),

  solicitarSaidaEncarregado: (motivo: string) =>
    request<null>('post', `/api/v1/empresa/encarregado-sistema/solicitar-saida`, { motivo }),
};
