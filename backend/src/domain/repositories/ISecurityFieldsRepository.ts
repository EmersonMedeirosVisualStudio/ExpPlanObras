export interface ListPoliciesFilter {
  recurso?: string
  acao?: string
  ativo?: boolean
  pagina: number
  limite: number
}

export interface ListPoliciesResult {
  rows: unknown[]
  total: number
}

export interface CreatePolicyInput {
  recurso: string
  acao: string
  caminhoCampo: string
  efeitoCampo: string
  estrategiaMascara?: string | null
  prioridade: number
  condicaoJson?: unknown | null
  ativo: boolean
  criadoPorUserId: number
  atualizadoPorUserId: number
  alvos: PolicyTargetInput[]
}

export interface UpdatePolicyInput {
  recurso: string
  acao: string
  caminhoCampo: string
  efeitoCampo: string
  estrategiaMascara?: string | null
  prioridade: number
  condicaoJson?: unknown | null
  ativo: boolean
  atualizadoPorUserId: number
  alvos: PolicyTargetInput[]
}

export interface PolicyTargetInput {
  tipoAlvo: string
  userId?: number | null
  perfilCodigo?: string | null
  permissao?: string | null
  ativo: boolean
}

export interface ListAuditLogsFilter {
  recurso?: string
  acao?: string
  userId?: number
  pagina: number
  limite: number
}

export interface ListAuditLogsResult {
  rows: unknown[]
  total: number
}

export interface CheckTenantUserInput {
  tenantId: number
  userId: number
}

export interface TenantUserRole {
  id: number
  role: string
}

export interface ISecurityFieldsRepository {
  // Policies
  listPolicies(tenantId: number, filter: ListPoliciesFilter): Promise<ListPoliciesResult>
  getPolicyById(tenantId: number, id: number): Promise<unknown | null>
  createPolicy(tenantId: number, input: CreatePolicyInput): Promise<unknown>
  updatePolicy(tenantId: number, id: number, input: UpdatePolicyInput): Promise<unknown>

  // Auth helpers
  findTenantUser(input: CheckTenantUserInput): Promise<TenantUserRole | null>
  findSystemEncarregado(tenantId: number): Promise<{ userId: number | null } | null>

  // Audit logs
  listAuditLogs(tenantId: number, filter: ListAuditLogsFilter): Promise<ListAuditLogsResult>
}
