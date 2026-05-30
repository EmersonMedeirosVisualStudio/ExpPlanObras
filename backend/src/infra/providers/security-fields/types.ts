export const FIELD_POLICY_EFFECTS = ['ALLOW', 'MASK', 'HIDE', 'NULLIFY', 'TRANSFORM'] as const;
export type FieldPolicyEffect = (typeof FIELD_POLICY_EFFECTS)[number];

export const FIELD_MASK_STRATEGIES = [
  'CPF',
  'CNPJ',
  'EMAIL',
  'PHONE',
  'NAME_INITIALS',
  'LAST4',
  'HASH_SHORT',
  'YEAR_ONLY',
  'AGE_RANGE',
  'MONEY_RANGE',
  'PARTIAL_TEXT',
  'FULL_REDACT',
  'CUSTOM',
] as const;
export type FieldMaskStrategy = (typeof FIELD_MASK_STRATEGIES)[number];

export const FIELD_CLASSIFICATIONS = ['PUBLICO', 'INTERNO', 'SENSIVEL', 'RESTRITO'] as const;
export type FieldClassification = (typeof FIELD_CLASSIFICATIONS)[number];

export type FieldCatalogEntry = {
  resource: string;
  path: string;
  classification: FieldClassification;
  defaultEffect?: FieldPolicyEffect;
  defaultMaskStrategy?: FieldMaskStrategy | null;
  exportSensitive?: boolean;
};

export type FieldDecision = {
  effect: FieldPolicyEffect;
  strategy?: FieldMaskStrategy | null;
  reason?: string | null;
  policyId?: number | null;
};

export type SanitizeAction = 'VIEW' | 'EXPORT' | 'SEARCH' | 'ANALYTICS';

export type SanitizeContext = {
  tenantId: number;
  userId: number;
  resource: string;
  action: SanitizeAction;
  entityId?: number | null;
  exportacao?: boolean;
};

export type SubjectContext = {
  tenantId: number;
  userId: number;
  role: string;
  perfis: string[];
};

