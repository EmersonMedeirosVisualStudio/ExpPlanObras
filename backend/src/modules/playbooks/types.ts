export const PLAYBOOK_MODES = ['MANUAL', 'SEMI_AUTOMATICO', 'AUTOMATICO'] as const;
export type PlaybookMode = (typeof PLAYBOOK_MODES)[number];

export const PLAYBOOK_TRIGGERS = ['ALERTA_ABERTO', 'ALERTA_CRITICO', 'INCIDENTE_ABERTO', 'EVENTO_CORRELACIONADO', 'AGENDADO', 'MANUAL'] as const;
export type PlaybookTriggerType = (typeof PLAYBOOK_TRIGGERS)[number];

export const PLAYBOOK_RISK_LEVELS = ['BAIXO', 'MEDIO', 'ALTO', 'CRITICO'] as const;
export type PlaybookRiskLevel = (typeof PLAYBOOK_RISK_LEVELS)[number];

export const PLAYBOOK_APPROVAL_POLICIES = ['NAO_EXIGE', 'EXIGE_ANTES', 'EXIGE_SE_RISCO_ALTO', 'QUATRO_OLHOS'] as const;
export type PlaybookApprovalPolicy = (typeof PLAYBOOK_APPROVAL_POLICIES)[number];

export const PLAYBOOK_EXEC_STATUSES = ['PENDENTE_APROVACAO', 'AGENDADA', 'EXECUTANDO', 'CONCLUIDA', 'PARCIAL', 'FALHA', 'CANCELADA'] as const;
export type PlaybookExecutionStatus = (typeof PLAYBOOK_EXEC_STATUSES)[number];

export const PLAYBOOK_STEP_STATUSES = ['PENDENTE', 'EXECUTANDO', 'CONCLUIDO', 'FALHA', 'IGNORADO', 'ROLLBACK_EXECUTADO'] as const;
export type PlaybookStepStatus = (typeof PLAYBOOK_STEP_STATUSES)[number];

export type PlaybookActionType =
  | 'SESSOES_INVALIDAR_USUARIO'
  | 'USUARIO_BLOQUEAR_TEMPORARIAMENTE'
  | 'USUARIO_EXIGIR_REAUTENTICACAO'
  | 'USUARIO_EXIGIR_MFA'
  | 'TOKEN_REVOGAR'
  | 'DISPOSITIVO_PUSH_INVALIDAR'
  | 'INTEGRACAO_DESABILITAR'
  | 'EXPORTACOES_SENSIVEIS_PAUSAR'
  | 'JOB_EXECUTAR'
  | 'JOB_REPROCESSAR'
  | 'FILA_REPROCESSAR'
  | 'FILA_PAUSAR'
  | 'CACHE_INVALIDAR'
  | 'WORKFLOW_CRIAR_TAREFA'
  | 'APROVACAO_CRIAR_EXTRAORDINARIA'
  | 'NOTIFICAR_USUARIO'
  | 'NOTIFICAR_PERMISSAO'
  | 'ENVIAR_EMAIL'
  | 'PUBLICAR_REALTIME'
  | 'ABRIR_INCIDENTE'
  | 'CRIAR_CASO_COMPLIANCE'
  | 'ANEXAR_EVIDENCIA'
  | 'LEGAL_HOLD_APLICAR'
  | 'MARCAR_DATASET_SOB_REVISAO';

export type PlaybookActionExecutionInput = {
  tenantId: number;
  executorUserId: number;
  playbookId: number;
  execucaoId: number;
  passoId: number;
  tipoAcao: PlaybookActionType;
  configuracao: any;
  alertaId?: number | null;
  incidenteId?: number | null;
  eventoOrigemId?: number | null;
};

export type PlaybookActionExecutionResult = {
  ok: boolean;
  output?: any;
  error?: string;
  mutated?: Record<string, any>;
  incidenteId?: number | null;
  casoComplianceId?: number | null;
};

export type PlaybookActionRollbackInput = {
  tenantId: number;
  executorUserId: number;
  playbookId: number;
  execucaoId: number;
  passoId: number;
  tipoAcao: PlaybookActionType;
  configuracao: any;
  previous?: any;
};

export type PlaybookActionRollbackResult = {
  ok: boolean;
  output?: any;
  error?: string;
};

export type PlaybookActionExecutor = {
  type: PlaybookActionType;
  execute(input: PlaybookActionExecutionInput): Promise<PlaybookActionExecutionResult>;
  rollback?(input: PlaybookActionRollbackInput): Promise<PlaybookActionRollbackResult>;
};

