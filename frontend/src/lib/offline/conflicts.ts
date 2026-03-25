export type OfflineConflictItem = {
  operacaoUuid: string;
  message?: string;
  serverSnapshot?: Record<string, unknown>;
};

