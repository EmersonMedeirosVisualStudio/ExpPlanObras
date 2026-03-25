import type {
  DocumentoAcaoDTO,
  DocumentoCriarDTO,
  DocumentoDetalheDTO,
  DocumentoFluxoUpsertDTO,
  DocumentoRegistroDTO,
  DocumentoVerificacaoDTO,
  DocumentoVersaoDetalheDTO,
} from './types';

type ApiResponse<T> = { success: boolean; message?: string; data: T };

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, cache: 'no-store' });
  const json = (await res.json().catch(() => null)) as ApiResponse<T> | null;
  if (!res.ok || !json?.success) throw new Error(json?.message || 'Erro na requisição');
  return json.data;
}

function qs(params?: Record<string, string | number | boolean | undefined | null>) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params || {})) {
    if (v === undefined || v === null || v === '') continue;
    p.set(k, String(v));
  }
  const s = p.toString();
  return s ? `?${s}` : '';
}

export const DocumentosApi = {
  listar: (params?: { limit?: number }) => api<DocumentoRegistroDTO[]>(`/api/v1/documentos${qs(params)}`),
  criar: (body: DocumentoCriarDTO) =>
    api<{ id: number }>('/api/v1/documentos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  obter: (id: number) => api<DocumentoDetalheDTO>(`/api/v1/documentos/${id}`),

  criarVersaoUpload: async (documentoId: number, file: File) => {
    const res = await fetch(`/api/v1/documentos/${documentoId}/versoes`, {
      method: 'POST',
      headers: { 'Content-Type': file.type || 'application/octet-stream', 'X-Filename': file.name },
      body: file,
      cache: 'no-store',
    });
    const json = (await res.json().catch(() => null)) as ApiResponse<{ id: number; token: string }> | null;
    if (!res.ok || !json?.success) throw new Error(json?.message || 'Erro no upload');
    return json.data;
  },

  obterVersao: (versaoId: number) => api<DocumentoVersaoDetalheDTO>(`/api/v1/documentos/versoes/${versaoId}`),
  upsertFluxo: (versaoId: number, body: DocumentoFluxoUpsertDTO) =>
    api<void>(`/api/v1/documentos/versoes/${versaoId}/fluxo`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  acao: (versaoId: number, body: DocumentoAcaoDTO) =>
    api<void>(`/api/v1/documentos/versoes/${versaoId}/acoes`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),

  verificarVersao: (versaoId: number) => api<DocumentoVerificacaoDTO>(`/api/v1/documentos/versoes/${versaoId}/verificar`),
  verificarToken: (token: string) => api<DocumentoVerificacaoDTO>(`/api/v1/documentos/verificacao/${encodeURIComponent(token)}`),
};

