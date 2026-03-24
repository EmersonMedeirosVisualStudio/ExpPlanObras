import type { NotificacaoDTO, NotificacaoPreferenciaDTO, NotificacaoPreferenciaSaveDTO } from './types';

type ApiResponse<T> = { success: boolean; message?: string; data: T };

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
    cache: 'no-store',
  });
  const json = (await res.json().catch(() => null)) as ApiResponse<T> | null;
  if (!res.ok || !json?.success) throw new Error(json?.message || 'Erro na requisição');
  return json.data;
}

function qs(params?: { status?: string; modulo?: string; limit?: number }) {
  const p = new URLSearchParams();
  if (params?.status) p.set('status', params.status);
  if (params?.modulo) p.set('modulo', params.modulo);
  if (params?.limit) p.set('limit', String(params.limit));
  const s = p.toString();
  return s ? `?${s}` : '';
}

export const NotificationsApi = {
  listar: (params?: { status?: string; modulo?: string; limit?: number }) =>
    api<NotificacaoDTO[]>(`/api/v1/me/notificacoes${qs(params)}`),
  naoLidas: () => api<{ total: number; porModulo: Record<string, number> }>('/api/v1/me/notificacoes/nao-lidas'),
  marcarLida: (id: number) => api<void>(`/api/v1/me/notificacoes/${id}/lida`, { method: 'POST' }),
  marcarTodasLidas: (modulo?: string) =>
    api<void>('/api/v1/me/notificacoes/marcar-todas-lidas', { method: 'POST', body: JSON.stringify({ modulo }) }),
  preferencias: () => api<NotificacaoPreferenciaDTO[]>('/api/v1/me/notificacoes/preferencias'),
  salvarPreferencias: (body: NotificacaoPreferenciaSaveDTO[]) =>
    api<void>('/api/v1/me/notificacoes/preferencias', { method: 'POST', body: JSON.stringify(body) }),
};

