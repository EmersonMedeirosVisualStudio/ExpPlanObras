import type { MenuBadgesMapDTO, MenuResponseDTO } from './types';

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

export const NavigationApi = {
  obterMenu: () => api<MenuResponseDTO>('/api/v1/me/menu'),
  obterBadges: () => api<MenuBadgesMapDTO>('/api/v1/me/menu-badges'),
};

