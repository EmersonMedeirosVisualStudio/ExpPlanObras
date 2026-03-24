export type AlertModule = 'RH' | 'SST' | 'SUPRIMENTOS' | 'ENGENHARIA' | 'ADMIN';

export type AlertSeverity = 'INFO' | 'WARNING' | 'DANGER' | 'CRITICAL';

export type AlertSignal = {
  module: AlertModule;
  key: string;
  dedupeKey: string;
  titulo: string;
  mensagem: string;
  severity: AlertSeverity;
  menuKeys?: string[];
  rota?: string | null;
  entidadeTipo?: string | null;
  entidadeId?: number | null;
  referenciaData?: string | null;
  expiresAt?: string | null;
  metadata?: Record<string, unknown>;
};

export type AlertCollectContext = {
  tenantId: number;
  userId: number;
  permissions: string[];
  scope: {
    empresaTotal: boolean;
    diretorias?: number[];
    obras?: number[];
    unidades?: number[];
  };
};

export type AlertProvider = {
  module: AlertModule;
  collect: (ctx: AlertCollectContext) => Promise<AlertSignal[]>;
};

