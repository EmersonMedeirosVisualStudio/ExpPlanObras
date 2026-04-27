import type {
  DocumentoAcaoDTO,
  DocumentoCriarDTO,
  DocumentoDetalheDTO,
  DocumentoFluxoUpsertDTO,
  DocumentoRegistroDTO,
  DocumentoVerificacaoDTO,
  DocumentoVersaoDetalheDTO,
} from './types';

import api from '@/lib/api';

type ApiResponse<T> = { success: boolean; message?: string; data: T };

function unwrapApiData<T>(json: any): T {
  if (!json || typeof json !== 'object') throw new Error('Resposta inválida');
  const ok = Boolean((json as ApiResponse<T>).success);
  if (!ok) throw new Error(String((json as ApiResponse<T>).message || 'Erro na requisição'));
  return (json as ApiResponse<T>).data;
}

function getToken() {
  try {
    return localStorage.getItem('token') || '';
  } catch {
    return '';
  }
}

export const DocumentosApi = {
  listar: (params?: {
    limit?: number;
    entidadeTipo?: string | null;
    entidadeId?: number | null;
    categoriaPrefix?: string | null;
    incluirObrasDoContrato?: boolean;
  }) =>
    api
      .get('/api/v1/documentos', {
        params: {
          ...params,
          incluirObrasDoContrato: params?.incluirObrasDoContrato ? 1 : 0,
        },
      })
      .then((r) => unwrapApiData<DocumentoRegistroDTO[]>(r.data)),
  criar: async (body: DocumentoCriarDTO) => {
    const created = await api.post('/api/v1/documentos', body).then((r) => unwrapApiData<{ id: number }>(r.data));
    try {
      const entidadeTipo = body?.entidadeTipo ? String(body.entidadeTipo).trim().toUpperCase() : '';
      const entidadeId = body?.entidadeId != null ? Number(body.entidadeId) : 0;
      if (entidadeTipo === 'OBRA' && Number.isInteger(entidadeId) && entidadeId > 0) {
        const categoria = String(body.categoriaDocumento || '').trim().toUpperCase();
        const titulo = String(body.tituloDocumento || '').trim();
        const msg = `Documento criado: ${categoria || 'OBRA'} — ${titulo || '(sem título)'}`;
        await api.post('/api/v1/engenharia/obras/historico', { idObra: entidadeId, mensagem: msg });
      }
    } catch {}
    return created;
  },
  obter: (id: number) => api.get(`/api/v1/documentos/${id}`).then((r) => unwrapApiData<DocumentoDetalheDTO>(r.data)),

  criarVersaoUpload: async (documentoId: number, file: File) => {
    const token = getToken();
    const res = await fetch(`/api/v1/documentos/${documentoId}/versoes`, {
      method: 'POST',
      headers: {
        'Content-Type': file.type || 'application/octet-stream',
        'X-Filename': file.name,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: file,
      cache: 'no-store',
    });
    const json = (await res.json().catch(() => null)) as ApiResponse<{ id: number; token: string }> | null;
    if (!res.ok || !json?.success) throw new Error(json?.message || 'Erro no upload');
    return json.data;
  },

  obterVersao: (versaoId: number) => api.get(`/api/v1/documentos/versoes/${versaoId}`).then((r) => unwrapApiData<DocumentoVersaoDetalheDTO>(r.data)),
  upsertFluxo: (versaoId: number, body: DocumentoFluxoUpsertDTO) =>
    api.put(`/api/v1/documentos/versoes/${versaoId}/fluxo`, body).then((r) => unwrapApiData<void>(r.data)),
  acao: (versaoId: number, body: DocumentoAcaoDTO) =>
    api.post(`/api/v1/documentos/versoes/${versaoId}/acoes`, body).then((r) => unwrapApiData<void>(r.data)),

  verificarVersao: (versaoId: number) => api.get(`/api/v1/documentos/versoes/${versaoId}/verificar`).then((r) => unwrapApiData<DocumentoVerificacaoDTO>(r.data)),
  verificarToken: (token: string) => api.get(`/api/v1/documentos/verificacao/${encodeURIComponent(token)}`).then((r) => unwrapApiData<DocumentoVerificacaoDTO>(r.data)),
};

