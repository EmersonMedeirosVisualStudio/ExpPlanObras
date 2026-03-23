import type { AbrangenciaDTO, PerfilDTO, UsuarioDTO } from './types';

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
  });

  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.success) throw new Error(json?.message || 'Erro na requisição');
  return json.data as T;
}

export const GovernancaApi = {
  listarUsuarios: (q?: string) => api<UsuarioDTO[]>(`/api/v1/governanca/usuarios${q ? `?q=${encodeURIComponent(q)}` : ''}`),

  criarUsuario: (payload: { idFuncionario: number; login: string; emailLogin: string; ativo: boolean; bloqueado: boolean }) =>
    api<{ id: number }>(`/api/v1/governanca/usuarios`, { method: 'POST', body: JSON.stringify(payload) }),

  atualizarUsuario: (id: number, payload: { emailLogin: string; ativo: boolean; bloqueado: boolean }) =>
    api<null>(`/api/v1/governanca/usuarios/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),

  atualizarStatusUsuario: (id: number, payload: { ativo: boolean; bloqueado: boolean }) =>
    api<null>(`/api/v1/governanca/usuarios/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),

  resetarAcessoUsuario: (id: number) => api<null>(`/api/v1/governanca/usuarios/${id}/reset-acesso`, { method: 'POST' }),

  atualizarPerfisUsuario: (id: number, perfisIds: number[]) =>
    api<null>(`/api/v1/governanca/usuarios/${id}/perfis`, { method: 'PUT', body: JSON.stringify({ perfisIds }) }),

  listarPerfis: () => api<PerfilDTO[]>(`/api/v1/governanca/perfis`),

  criarPerfil: (payload: { nome: string; codigo: string; permissoes: { modulo: string; janela: string; acao: string }[] }) =>
    api<{ id: number }>(`/api/v1/governanca/perfis`, { method: 'POST', body: JSON.stringify(payload) }),

  atualizarPerfil: (id: number, payload: { nome: string; codigo: string; ativo: boolean; permissoes: { modulo: string; janela: string; acao: string }[] }) =>
    api<null>(`/api/v1/governanca/perfis/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),

  listarAbrangencias: () => api<any[]>(`/api/v1/governanca/abrangencias`),

  criarAbrangencia: (payload: AbrangenciaDTO) =>
    api<{ id: number }>(`/api/v1/governanca/abrangencias`, { method: 'POST', body: JSON.stringify(payload) }),

  atualizarAbrangencia: (id: number, payload: AbrangenciaDTO) =>
    api<null>(`/api/v1/governanca/abrangencias/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),

  solicitarSaidaEncarregado: (motivo: string) =>
    api<null>(`/api/v1/empresa/encarregado-sistema/solicitar-saida`, { method: 'POST', body: JSON.stringify({ motivo }) }),
};
