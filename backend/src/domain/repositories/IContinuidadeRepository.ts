// ── BcpPlano filters & shapes ─────────────────────────────────────────────

export interface ListBcpPlanosFilter {
  tipo?: string
  ativo?: boolean
  pagina?: number
  limite?: number
}

export interface CreateBcpPlanoInput {
  codigo: string
  nome: string
  descricao?: string | null
  tipoPlano: string
  modulo?: string | null
  criticidade: string
  rtoMinutos: number
  rpoMinutos: number
  ownerUserId: number
}

// ── DrExecucaoRecuperacao filters & shapes ────────────────────────────────

export interface ListDrExecucoesFilter {
  status?: string
  pagina?: number
  limite?: number
}

export interface CreateDrExecucaoInput {
  planoId: number
  origemTipo: string
  referenciaOrigem?: string | null
  tipoRecuperacao: string
  statusExecucao: string
  aprovacaoExigida: boolean
  iniciadoEm?: Date | null
}

export interface ApproveDrExecucaoInput {
  aprovadoPor: number
}

export interface ConcludeDrExecucaoInput {
  sucesso: boolean
  rtoRealMinutos?: number | null
  rpoRealMinutos?: number | null
  resultadoResumoJson?: unknown
}

// ── CriseRegistro filters & shapes ────────────────────────────────────────

export interface ListCrisesFilter {
  status?: string
  pagina?: number
  limite?: number
}

export interface CreateCriseRegistroInput {
  codigo: string
  titulo: string
  descricao?: string | null
  tipoCrise: string
  severidade: string
  incidenteOrigemId?: number | null
  planoAcionadoId?: number | null
  comandanteUserId: number
}

// ── Paginated result ──────────────────────────────────────────────────────

export interface PaginatedResult<T> {
  rows: T[]
  total: number
}

// ── Repository interface ──────────────────────────────────────────────────

export interface IContinuidadeRepository {
  // BcpPlano
  listBcpPlanos(tenantId: number, filter?: ListBcpPlanosFilter): Promise<PaginatedResult<unknown>>
  getBcpPlanoById(tenantId: number, id: number): Promise<unknown | null>
  createBcpPlano(tenantId: number, input: CreateBcpPlanoInput): Promise<unknown>

  // DrExecucaoRecuperacao
  listDrExecucoes(tenantId: number, filter?: ListDrExecucoesFilter): Promise<PaginatedResult<unknown>>
  getDrExecucaoById(tenantId: number, id: number): Promise<unknown | null>
  createDrExecucao(tenantId: number, input: CreateDrExecucaoInput): Promise<unknown>
  approveDrExecucao(tenantId: number, id: number, input: ApproveDrExecucaoInput): Promise<void>
  concludeDrExecucao(tenantId: number, id: number, input: ConcludeDrExecucaoInput): Promise<void>

  // CriseRegistro
  listCrises(tenantId: number, filter?: ListCrisesFilter): Promise<PaginatedResult<unknown>>
  createCriseRegistro(tenantId: number, input: CreateCriseRegistroInput): Promise<unknown>

  // Readiness helpers (used by readiness.ts)
  countBcpPlanoAtivosCriticos(tenantId: number, planoId: number): Promise<number>
  countBcpPlanoRunbooks(tenantId: number, planoId: number): Promise<number>
  findLastBcpTeste(tenantId: number, planoId: number): Promise<unknown | null>
  countDrExecucoesConcluidas(tenantId: number, planoId: number): Promise<number>
}
