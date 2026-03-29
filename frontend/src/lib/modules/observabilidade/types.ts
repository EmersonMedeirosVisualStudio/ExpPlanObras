export type ObservabilityCategory =
  | 'AUTH'
  | 'AUTHZ'
  | 'SECURITY'
  | 'DADOS_SENSIVEIS'
  | 'EXPORTACAO'
  | 'DOCUMENTOS'
  | 'WORKFLOW'
  | 'APROVACAO'
  | 'NOTIFICACAO'
  | 'INTEGRACAO'
  | 'JOB'
  | 'API'
  | 'SISTEMA'
  | 'PWA_SYNC'
  | 'PORTAL_EXTERNO';

export type ObservabilitySeverity = 'DEBUG' | 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL';
export type ObservabilityResult = 'SUCESSO' | 'FALHA' | 'NEGADO' | 'PARCIAL' | 'TIMEOUT';
export type ObservabilitySourceType = 'WEB' | 'API' | 'JOB' | 'WORKER' | 'WEBHOOK' | 'INTERNAL' | 'MOBILE' | 'PORTAL_PARCEIRO';

export type ObservabilityEventDTO = {
  id: number;
  eventId: string;
  tenantId: number;
  categoria: ObservabilityCategory;
  subcategoria?: string | null;
  nomeEvento: string;
  severidade: ObservabilitySeverity;
  resultado: ObservabilityResult;
  origemTipo: ObservabilitySourceType;
  origemChave?: string | null;
  modulo?: string | null;
  entidadeTipo?: string | null;
  entidadeId?: number | null;
  actorTipo?: string | null;
  actorUserId?: number | null;
  actorEmail?: string | null;
  targetTipo?: string | null;
  targetId?: number | null;
  requestId?: string | null;
  correlationId?: string | null;
  sessionId?: string | null;
  traceId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  rota?: string | null;
  metodoHttp?: string | null;
  statusHttp?: number | null;
  payloadRedacted?: Record<string, unknown> | null;
  labels?: Record<string, string> | null;
  ocorridoEm: string;
};

export type ObservabilityRuleDTO = {
  id: number;
  tenantId: number;
  nome: string;
  descricao?: string | null;
  tipoRegra: 'THRESHOLD' | 'CORRELATION' | 'SEQUENCE' | 'ANOMALIA_SIMPLES';
  categoriaAlvo?: string | null;
  filtroJson?: unknown | null;
  janelaMinutos: number;
  limiarValor?: number | null;
  agrupamentoJson?: unknown | null;
  severidadeAlerta: ObservabilitySeverity;
  geraIncidenteAutomatico: boolean;
  notificarJson?: unknown | null;
  ativo: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ObservabilityAlertDTO = {
  id: number;
  tenantId: number;
  regraId: number;
  titulo: string;
  descricao?: string | null;
  severidade: ObservabilitySeverity;
  statusAlerta: 'ABERTO' | 'RECONHECIDO' | 'RESOLVIDO' | 'SUPRIMIDO';
  dedupeKey?: string | null;
  primeiroEventoEm: string;
  ultimoEventoEm: string;
  totalEventos: number;
  responsavelUserId?: number | null;
  metadataJson?: unknown | null;
  createdAt: string;
  updatedAt: string;
};

export type ObservabilityIncidentDTO = {
  id: number;
  tenantId: number;
  alertaOrigemId?: number | null;
  tipoIncidente: string;
  titulo: string;
  descricao?: string | null;
  criticidade: 'BAIXA' | 'MEDIA' | 'ALTA' | 'CRITICA';
  statusIncidente: 'ABERTO' | 'EM_TRIAGEM' | 'EM_TRATAMENTO' | 'MITIGADO' | 'ENCERRADO';
  ownerUserId?: number | null;
  slaRespostaEm?: string | null;
  slaResolucaoEm?: string | null;
  resolvidoEm?: string | null;
  causaRaiz?: string | null;
  impactoResumo?: string | null;
  acoesTomadasJson?: unknown | null;
  createdAt: string;
  updatedAt: string;
};

export type ObservabilityMetricDTO = {
  id: number;
  tenantId: number;
  chaveMetrica: string;
  dimensao_1?: string | null;
  dimensao_2?: string | null;
  bucket_inicio: string;
  bucket_fim: string;
  valor_numero?: number | null;
  valor_json?: unknown | null;
  createdAt: string;
  updatedAt: string;
};

export type ObservabilitySavedSearchDTO = {
  id: number;
  tenantId: number;
  idUsuario: number;
  nome: string;
  filtroJson: unknown;
  publica: boolean;
  createdAt: string;
  updatedAt: string;
};
