import type { TerceirizadoResumoDTO } from './types';

type ApiResponse<T> = {
  success: boolean;
  message?: string;
  data: T;
  meta?: Record<string, unknown>;
};

async function api<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  let token: string | null = null;
  try {
    if (typeof window !== 'undefined') token = localStorage.getItem('token');
  } catch {}

  const res = await fetch(input, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers || {}),
    },
    cache: 'no-store',
  });

  const json = (await res.json().catch(() => null)) as ApiResponse<T> | null;
  if (!res.ok || !json?.success) throw new Error(json?.message || 'Erro na requisição');
  return json.data;
}

export const TerceirizadosApi = {
  listar: (q = '', params?: { limit?: number; idObra?: number; idContrato?: number }) => {
    const limit = typeof params?.limit === 'number' ? `&limit=${encodeURIComponent(String(params.limit))}` : '';
    const idObra = typeof params?.idObra === 'number' && params.idObra > 0 ? `&idObra=${encodeURIComponent(String(params.idObra))}` : '';
    const idContrato =
      typeof params?.idContrato === 'number' && params.idContrato > 0 ? `&idContrato=${encodeURIComponent(String(params.idContrato))}` : '';
    return api<TerceirizadoResumoDTO[]>(`/api/v1/rh/terceirizados?q=${encodeURIComponent(q)}${limit}${idObra}${idContrato}`);
  },

  obter: (id: number) => api<TerceirizadoResumoDTO>(`/api/v1/rh/terceirizados/${encodeURIComponent(String(id))}`),

  criar: (payload: {
    nomeCompleto: string;
    cpf: string;
    dataNascimento: string;
    funcao?: string | null;
    telefoneWhatsapp?: string | null;
    identidade?: string | null;
    titulo?: string | null;
    nomeMae?: string | null;
    nomePai?: string | null;
    idContraparteEmpresa?: number | null;
    ativo?: boolean;
    idEmpresaParceira?: number | null;
  }) =>
    api<{ id: number }>(`/api/v1/rh/terceirizados`, { method: 'POST', body: JSON.stringify(payload) }),
};
