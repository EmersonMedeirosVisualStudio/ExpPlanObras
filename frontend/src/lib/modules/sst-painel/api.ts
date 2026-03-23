type ApiResponse<T> = { success: boolean; message?: string; data: T };

async function api<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const res = await fetch(input, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
    cache: 'no-store',
  });
  const json = (await res.json()) as ApiResponse<T>;
  if (!res.ok || !json.success) throw new Error(json.message || 'Erro');
  return json.data;
}

type PainelFiltro = {
  tipoLocal?: 'OBRA' | 'UNIDADE';
  idObra?: number;
  idUnidade?: number;
};

function qs(f?: PainelFiltro) {
  const p = new URLSearchParams();
  if (f?.tipoLocal) p.set('tipoLocal', f.tipoLocal);
  if (f?.idObra) p.set('idObra', String(f.idObra));
  if (f?.idUnidade) p.set('idUnidade', String(f.idUnidade));
  return p.toString() ? `?${p.toString()}` : '';
}

export const SstPainelApi = {
  resumo: (f?: PainelFiltro) => api<any>(`/api/v1/sst/painel/resumo${qs(f)}`),
  alertas: (f?: PainelFiltro) => api<any[]>(`/api/v1/sst/painel/alertas${qs(f)}`),
  series: (f?: PainelFiltro) => api<any>(`/api/v1/sst/painel/series${qs(f)}`),
};
