export type OfflineOutboxStatus = 'PENDENTE' | 'ENVIANDO' | 'CONFLITO' | 'ERRO' | 'SINCRONIZADO';

export type OfflineModulo = 'RH' | 'SST';

export type OfflineOutboxItem = {
  id: string;
  modulo: OfflineModulo;
  tipoOperacao: string;
  entidadeTipo: string;
  entidadeLocalId?: string | null;
  entidadeServidorId?: number | null;
  payload: Record<string, unknown>;
  operacaoUuid: string;
  baseVersion?: string | null;
  status: OfflineOutboxStatus;
  tentativas: number;
  criadoEm: string;
  atualizadoEm: string;
};

export type SyncBatchRequestDTO = {
  dispositivoId: string;
  itens: Array<{
    operacaoUuid: string;
    tipoOperacao: string;
    entidadeServidorId?: number;
    entidadeLocalId?: string;
    baseVersion?: string | null;
    payload: Record<string, unknown>;
    clientTimestamp: string;
  }>;
};

export type SyncBatchResponseDTO = {
  resultados: Array<{
    operacaoUuid: string;
    status: 'APLICADO' | 'DUPLICADO' | 'CONFLITO' | 'REJEITADO';
    entidadeServidorId?: number;
    message?: string;
    serverSnapshot?: Record<string, unknown>;
  }>;
};

