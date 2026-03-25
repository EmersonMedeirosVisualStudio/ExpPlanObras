export type GlobalSearchModulo = 'RH' | 'SST' | 'SUPRIMENTOS' | 'ENGENHARIA' | 'ADMIN' | 'GERAL';

export type GlobalSearchResultType = 'ENTIDADE' | 'ATALHO' | 'ACAO' | 'RECENTE' | 'FAVORITO';

export type GlobalSearchResultDTO = {
  id: string;
  type: GlobalSearchResultType;
  modulo: GlobalSearchModulo;
  entidadeTipo?: string | null;
  entidadeId?: number | null;
  titulo: string;
  subtitulo?: string | null;
  rota?: string | null;
  status?: string | null;
  codigoReferencia?: string | null;
  badge?: string | null;
  icon?: string | null;
  score: number;
  metadata?: Record<string, unknown>;
};

export type GlobalSearchResponseDTO = {
  query: string;
  resultados: GlobalSearchResultDTO[];
  grupos: { modulo: GlobalSearchModulo; total: number }[];
};

export type GlobalSearchSuggestResponseDTO = {
  recentes: GlobalSearchResultDTO[];
  favoritos: GlobalSearchResultDTO[];
  atalhos: GlobalSearchResultDTO[];
  acoes: GlobalSearchResultDTO[];
};

export type SearchDocumentInput = {
  tenantId: number;
  modulo: GlobalSearchModulo;
  entidadeTipo: string;
  entidadeId: number;
  titulo: string;
  subtitulo?: string | null;
  codigoReferencia?: string | null;
  statusReferencia?: string | null;
  rota: string;
  resumoTexto?: string | null;
  termosBusca?: string | null;
  palavrasChave?: string | null;
  permissaoView?: string | null;
  idDiretoria?: number | null;
  idObra?: number | null;
  idUnidade?: number | null;
  ativo?: boolean;
  atualizadoEmOrigem?: Date | null;
};

export type SearchIndexProvider = {
  entidadeTipo: string;
  modulo: GlobalSearchModulo;
  permissaoView?: string | null;
  reindexEntity: (tenantId: number, entityId: number) => Promise<void>;
  deleteEntity?: (tenantId: number, entityId: number) => Promise<void>;
  reindexAll?: (tenantId: number) => Promise<void>;
};

