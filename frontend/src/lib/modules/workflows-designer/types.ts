export type WorkflowDesignerNodeType = 'START' | 'STEP' | 'APPROVAL' | 'TASK' | 'END_SUCCESS' | 'END_ERROR' | 'CANCEL';

export type WorkflowDesignerNodeDTO = {
  id: string;
  type: WorkflowDesignerNodeType;
  position: { x: number; y: number };
  data: {
    key: string;
    label: string;
    color?: string | null;
    editavelEntidade?: boolean;
    bloqueiaEntidade?: boolean;
    exigeResponsavel?: boolean;
    slaHoras?: number | null;
    responsavelTipo?: string | null;
    idUsuarioResponsavel?: number | null;
    permissaoResponsavel?: string | null;
    metadata?: Record<string, unknown>;
  };
};

export type WorkflowDesignerFieldDTO = {
  key: string;
  label: string;
  type: 'TEXT' | 'TEXTAREA' | 'NUMBER' | 'DATE' | 'BOOLEAN' | 'SELECT' | 'JSON';
  required: boolean;
  order: number;
  options?: Array<{ label: string; value: string }>;
  validation?: Record<string, unknown>;
  defaultValue?: unknown;
};

export type WorkflowDesignerActionDTO = {
  type: 'NOTIFY' | 'EMAIL' | 'REALTIME' | 'CREATE_APPROVAL' | 'CREATE_TASK' | 'UPDATE_ENTITY_FIELD' | 'CALL_HANDLER';
  order: number;
  config?: Record<string, unknown>;
};

export type WorkflowDesignerEdgeDTO = {
  id: string;
  source: string;
  target: string;
  data: {
    key: string;
    label: string;
    tipoExecutor: string;
    idUsuarioExecutor?: number | null;
    permissaoExecutor?: string | null;
    exigeParecer?: boolean;
    exigeAssinatura?: boolean;
    permiteEmLote?: boolean;
    condition?: Record<string, unknown> | null;
    fields?: WorkflowDesignerFieldDTO[];
    actions?: WorkflowDesignerActionDTO[];
  };
};

export type WorkflowDesignerGraphDTO = {
  metadata: {
    codigo: string;
    nomeModelo: string;
    entidadeTipo: string;
    descricaoModelo?: string | null;
  };
  nodes: WorkflowDesignerNodeDTO[];
  edges: WorkflowDesignerEdgeDTO[];
};

export type WorkflowDesignerValidationIssue = {
  level: 'ERROR' | 'WARNING';
  code: string;
  message: string;
  nodeId?: string;
  edgeId?: string;
};

export type WorkflowDesignerValidationResult = {
  ok: boolean;
  issues: WorkflowDesignerValidationIssue[];
};

export type WorkflowDesignerRascunhoDTO = {
  id: number;
  codigo: string;
  nomeModelo: string;
  entidadeTipo: string;
  descricaoModelo: string | null;
  statusRascunho: 'RASCUNHO' | 'VALIDADO' | 'PUBLICADO' | 'ARQUIVADO';
  idModeloBase: number | null;
  graph: WorkflowDesignerGraphDTO;
  validation: WorkflowDesignerValidationResult | null;
  changelogText: string | null;
  lockedByUserId: number | null;
  lockExpiresAt: string | null;
  criadoEm: string;
  atualizadoEm: string;
};

export type WorkflowDesignerSimulationResult = {
  ok: boolean;
  issues: WorkflowDesignerValidationIssue[];
  startNodeId: string | null;
  finalNodeIds: string[];
  simulatedPath: Array<{ nodeId: string; nodeKey: string; nodeLabel: string }>;
  steps: Array<{
    fromNodeId: string;
    candidates: Array<{ edgeId: string; edgeKey: string; edgeLabel: string; conditionMatched: boolean }>;
    chosenEdgeId: string | null;
    toNodeId: string | null;
  }>;
};

