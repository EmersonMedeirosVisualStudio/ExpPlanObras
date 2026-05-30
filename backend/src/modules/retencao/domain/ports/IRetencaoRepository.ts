// ── Politica filters & inputs ─────────────────────────────────────────────

export interface ListPoliticasFilter {
  recurso?: string
  ativo?: boolean
  pagina?: number
  limite?: number
}

export interface CreatePoliticaInput {
  codigoPolitica: string
  nomePolitica: string
  recurso: string
  categoriaRecurso?: string | null
  eventoBase: string
  periodoValor: number
  periodoUnidade: string
  acaoFinal: string
  exigeAprovacaoDescarte: boolean
  respeitaBackupTtl: boolean
  anonimizarCamposJson?: unknown
  condicaoJson?: unknown
  prioridade: number
  ativo: boolean
  criadoPorUserId: number
  atualizadoPorUserId: number
}

export interface UpdatePoliticaInput {
  nomePolitica: string
  categoriaRecurso?: string | null
  eventoBase: string
  periodoValor: number
  periodoUnidade: string
  acaoFinal: string
  exigeAprovacaoDescarte: boolean
  respeitaBackupTtl: boolean
  anonimizarCamposJson?: unknown
  condicaoJson?: unknown
  prioridade: number
  ativo: boolean
  atualizadoPorUserId: number
}

// ── Retencao item filters ─────────────────────────────────────────────────

export interface ListRetencaoItemsFilter {
  recurso?: string
  status?: string
  holdAtivo?: boolean
  elegivel?: boolean
  pagina?: number
  limite?: number
}

// ── Legal hold inputs ─────────────────────────────────────────────────────

export interface CreateLegalHoldInput {
  codigoHold: string
  tituloHold: string
  motivoHold: string
  tipoHold: string
  criteriaJson?: unknown
  criadorUserId: number
}

// ── Descarte lote filters ─────────────────────────────────────────────────

export interface ListDescarteLotesFilter {
  pagina?: number
  limite?: number
}

// ── Auditoria filters ─────────────────────────────────────────────────────

export interface ListAuditoriaFilter {
  recurso?: string
  tipoEvento?: string
  pagina?: number
  limite?: number
}

// ── Paged result ──────────────────────────────────────────────────────────

export interface PagedResult<T> {
  rows: T[]
  total: number
}

// ── Repository interface ──────────────────────────────────────────────────

export interface IRetencaoRepository {
  // Politicas
  listPoliticas(tenantId: number, filter: ListPoliticasFilter): Promise<PagedResult<unknown>>
  getPoliticaById(tenantId: number, id: number): Promise<unknown>
  createPolitica(tenantId: number, input: CreatePoliticaInput): Promise<unknown>
  updatePolitica(tenantId: number, id: number, input: UpdatePoliticaInput): Promise<unknown>

  // Retencao items (inventory)
  listRetencaoItems(tenantId: number, filter: ListRetencaoItemsFilter): Promise<PagedResult<unknown>>

  // Legal holds
  listLegalHolds(tenantId: number): Promise<unknown[]>
  getLegalHoldById(tenantId: number, id: number): Promise<unknown>
  createLegalHold(tenantId: number, input: CreateLegalHoldInput): Promise<unknown>

  // Descarte lotes
  listDescarteLotes(tenantId: number, filter?: ListDescarteLotesFilter): Promise<unknown[]>
  getDescarteLoteById(tenantId: number, id: number): Promise<unknown>
  getDescarteLoteItens(tenantId: number, loteId: number): Promise<unknown[]>

  // Auditoria
  listAuditoria(tenantId: number, filter: ListAuditoriaFilter): Promise<PagedResult<unknown>>

  // TenantUser lookup (auth helper)
  getTenantUserRole(tenantId: number, userId: number): Promise<string | null>
}
