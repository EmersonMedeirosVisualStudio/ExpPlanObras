import type { AtalhoRapidoDTO, DashboardHomeDTO, FavoritoMenuDTO, HomePreferenciasDTO } from './types';

type ApiResponse<T> = { success: boolean; message?: string; data: T };

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    cache: 'no-store',
  });
  const json = (await res.json().catch(() => null)) as ApiResponse<T> | null;
  if (!res.ok || !json?.success) throw new Error(json?.message || 'Erro na requisição');
  return json.data;
}

export const HomeApi = {
  obterHome: () => api<DashboardHomeDTO>('/api/v1/dashboard/me/home'),
  obterFavoritos: () => api<FavoritoMenuDTO[]>('/api/v1/me/favoritos'),
  salvarFavoritos: (items: FavoritoMenuDTO[]) =>
    api<void>('/api/v1/me/favoritos', { method: 'POST', body: JSON.stringify({ items }) }),
  obterAtalhos: () => api<AtalhoRapidoDTO[]>('/api/v1/me/atalhos'),
  salvarAtalhos: (items: AtalhoRapidoDTO[]) =>
    api<void>('/api/v1/me/atalhos', { method: 'POST', body: JSON.stringify(items) }),
  obterPreferencias: () => api<HomePreferenciasDTO>('/api/v1/me/home-preferencias'),
  salvarPreferencias: (body: HomePreferenciasDTO) =>
    api<void>('/api/v1/me/home-preferencias', { method: 'POST', body: JSON.stringify(body) }),
};

