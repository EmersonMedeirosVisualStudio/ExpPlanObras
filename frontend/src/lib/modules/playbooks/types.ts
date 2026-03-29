export type PlaybookMode = 'MANUAL' | 'SEMI_AUTOMATICO' | 'AUTOMATICO';
export type PlaybookTriggerType = 'ALERTA_ABERTO' | 'ALERTA_CRITICO' | 'INCIDENTE_ABERTO' | 'EVENTO_CORRELACIONADO' | 'AGENDADO' | 'MANUAL';
export type PlaybookRiskLevel = 'BAIXO' | 'MEDIO' | 'ALTO' | 'CRITICO';
export type PlaybookApprovalPolicy = 'NAO_EXIGE' | 'EXIGE_ANTES' | 'EXIGE_SE_RISCO_ALTO' | 'QUATRO_OLHOS';

export type PlaybookStepDTO = {
  id: number;
  ordemExecucao: number;
  tipoAcao: string;
  nomePasso: string;
  descricao?: string | null;
  configuracaoJson?: unknown | null;
  timeoutSegundos?: number | null;
  continuaEmErro: boolean;
  reversivel: boolean;
  acaoCompensacaoJson?: unknown | null;
  riscoAcao: PlaybookRiskLevel;
};

export type PlaybookDTO = {
  id: number;
  tenantId: number;
  codigo: string;
  nome: string;
  descricao?: string | null;
  categoria?: string | null;
  modoExecucao: PlaybookMode;
  gatilhoTipo: PlaybookTriggerType;
  filtroEventoJson?: unknown | null;
  filtroAlertaJson?: unknown | null;
  filtroIncidenteJson?: unknown | null;
  riscoPadrao: PlaybookRiskLevel;
  politicaAprovacao: PlaybookApprovalPolicy;
  ativo: boolean;
  ordemPrioridade: number;
  createdAt: string;
  updatedAt: string;
  passos?: PlaybookStepDTO[];
};

export type PlaybookSimulationDTO = {
  ok: true;
  riskMax: PlaybookRiskLevel;
  approvalRequired: boolean;
  policy: PlaybookApprovalPolicy;
  steps: Array<{ id: number; ordemExecucao: number; tipoAcao: string; nomePasso: string; riscoAcao: PlaybookRiskLevel; reversivel: boolean }>;
};

export type PlaybookExecutionDTO = {
  id: number;
  tenantId: number;
  playbookId: number;
  alertaId?: number | null;
  incidenteId?: number | null;
  eventoOrigemId?: number | null;
  modoExecucao: string;
  statusExecucao: string;
  chaveIdempotencia: string;
  aprovacaoExigida: boolean;
  aprovadoPorUserId?: number | null;
  aprovadoEm?: string | null;
  iniciadoEm?: string | null;
  finalizadoEm?: string | null;
  resultadoResumoJson?: unknown | null;
  executadoPorUserId?: number | null;
  createdAt: string;
  updatedAt: string;
};
