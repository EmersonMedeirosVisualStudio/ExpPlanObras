export type RealtimeTargetType = 'USER' | 'PERMISSION' | 'TENANT';

export type RealtimeTopic =
  | 'menu'
  | 'notifications'
  | 'dashboard-rh'
  | 'dashboard-sst'
  | 'dashboard-suprimentos'
  | 'dashboard-engenharia'
  | 'dashboard-gerente'
  | 'dashboard-diretor'
  | 'dashboard-ceo'
  | 'backup'
  | 'relatorios';

export type RealtimeEventDTO = {
  id: number;
  topic: RealtimeTopic;
  name: string;
  payload?: Record<string, unknown> | null;
  createdAt: string;
};

export type PublishRealtimeEventInput = {
  tenantId: number;
  topic: RealtimeTopic;
  name: string;
  targetType: RealtimeTargetType;
  targetValue?: string | null;
  payload?: Record<string, unknown> | null;
  referenciaTipo?: string | null;
  referenciaId?: number | null;
  ttlSeconds?: number | null;
};

