export type PolicyEffect = 'ALLOW' | 'DENY';

export type PolicyAction = 'VIEW' | 'CREATE' | 'UPDATE' | 'DELETE' | 'APPROVE' | 'SIGN' | 'EXPORT' | 'EXECUTE' | 'MANAGE';

export type PolicyResource =
  | 'FUNCIONARIO'
  | 'PRESENCA'
  | 'HORA_EXTRA'
  | 'SST_NC'
  | 'SST_ACIDENTE'
  | 'SST_TREINAMENTO'
  | 'SST_CHECKLIST'
  | 'SUP_SOLICITACAO'
  | 'SUP_PEDIDO'
  | 'ENG_MEDICAO'
  | 'ENG_CONTRATO'
  | 'DOCUMENTO'
  | 'WORKFLOW'
  | 'APROVACAO'
  | 'BACKUP_RESTAURACAO'
  | 'ANALYTICS_DATASET';

export type SubjectContext = {
  tenantId: number;
  userId: number;
  roles: string[];
  permissions: string[];
  scope: {
    empresaTotal: boolean;
    diretorias: number[];
    obras: number[];
    unidades: number[];
  };
};

export type ResourceContext = {
  resource: PolicyResource;
  entityId?: number | null;
  diretoriaId?: number | null;
  tipoLocal?: 'OBRA' | 'UNIDADE' | null;
  idObra?: number | null;
  idUnidade?: number | null;
  creatorUserId?: number | null;
  ownerUserId?: number | null;
  responsibleUserId?: number | null;
  status?: string | null;
  value?: number | null;
  confidentiality?: 'BAIXA' | 'MEDIA' | 'ALTA' | 'RESTRITA' | null;
  attributes?: Record<string, unknown>;
};

export type ActionContext = {
  action: PolicyAction;
  ip?: string | null;
  userAgent?: string | null;
  nowIso: string;
  route?: string | null;
};

export type PolicyDecision = {
  allowed: boolean;
  source: 'RBAC' | 'ABAC' | 'SCOPE' | 'DEFAULT';
  policyId?: number | null;
  ruleId?: number | null;
  reason?: string | null;
};

export type PolicyConditionNode =
  | {
      all: PolicyConditionNode[];
    }
  | {
      any: PolicyConditionNode[];
    }
  | {
      left: string;
      op:
        | '='
        | '!='
        | '>'
        | '>='
        | '<'
        | '<='
        | 'in'
        | 'not_in'
        | 'contains'
        | 'intersects'
        | 'is_true'
        | 'is_false'
        | 'is_null'
        | 'not_null';
      right?: unknown;
    };

export type PolicyRuleDTO = {
  id: number;
  policyId: number;
  nomeRegra: string;
  efeito: PolicyEffect;
  prioridade: number;
  condicao: PolicyConditionNode;
  sqlHint?: unknown | null;
  ativo: boolean;
};

export type PolicyTargetDTO = {
  id: number;
  policyId: number;
  tipoAlvo: 'TODOS' | 'USUARIO' | 'PERFIL' | 'PERMISSAO';
  idUsuario: number | null;
  chavePerfil: string | null;
  chavePermissao: string | null;
  ativo: boolean;
};

export type PolicyDTO = {
  id: number;
  tenantId: number;
  nomePolitica: string;
  recurso: PolicyResource;
  acao: PolicyAction;
  descricaoPolitica: string | null;
  ativo: boolean;
  prioridadeBase: number;
  criadoPorUsuario: number;
  atualizadoPorUsuario: number;
  criadoEm: string;
  atualizadoEm: string;
  regras: PolicyRuleDTO[];
  alvos: PolicyTargetDTO[];
};

