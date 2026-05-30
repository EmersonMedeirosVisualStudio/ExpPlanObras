export interface GrcRiscoWhere {
  tenantId: number
  statusRisco?: string
  categoriaRisco?: string
}

export interface GrcControleWhere {
  tenantId: number
  ativo?: boolean
}

export interface GrcAuditoriaWhere {
  tenantId: number
  statusAuditoria?: string
}

export interface GrcAchadoWhere {
  tenantId: number
  statusAchado?: string
  gravidade?: string
}

export interface GrcPlanoAcaoWhere {
  tenantId: number
  statusPlano?: string
}

export interface GrcEvidenciaWhere {
  tenantId: number
  referenciaTipo?: string
  referenciaId?: number
}

export interface PaginationOptions {
  skip: number
  take: number
}

export interface CreateRiscoInput {
  tenantId: number
  codigo: string
  titulo: string
  descricao: string | null
  categoriaRisco: string
  modulo: string | null
  processoNegocio: string | null
  entidadeTipo: string | null
  entidadeId: number | null
  ownerUserId: number
  statusRisco: string
  impactoInerente: string
  probabilidadeInerente: string
  scoreInerente: number
  impactoResidual: string | null
  probabilidadeResidual: string | null
  scoreResidual: number | null
  apetiteScore: number | null
  toleranciaScore: number | null
  origemRisco: string | null
}

export interface UpdateRiscoInput {
  titulo?: string
  descricao?: string | null
  statusRisco?: string
  ownerUserId?: number | null
  apetiteScore?: number | null
  toleranciaScore?: number | null
  scoreResidual?: number
  impactoResidual?: string | null
  probabilidadeResidual?: string | null
}

export interface CreateRiscoAvaliacaoInput {
  tenantId: number
  riscoId: number
  tipoAvaliacao: string
  impacto: string
  probabilidade: string
  score: number
  justificativa: string | null
  avaliadoPor: number
}

export interface AddAvaliacaoTransactionInput {
  avaliacao: CreateRiscoAvaliacaoInput
  aplicarComoResidual: boolean
  riscoId: number
  impacto: string
  probabilidade: string
  score: number
}

export interface CreateControleInput {
  tenantId: number
  codigo: string
  nome: string
  descricao: string | null
  categoriaControle: string | null
  tipoControle: string
  automacaoControle: string
  frequenciaExecucao: string | null
  ownerUserId: number
  executorTipo: string | null
  evidenciaObrigatoria: boolean
  ativo: boolean
  criticidade: string
  objetivoControle: string | null
  procedimentoExecucao: string | null
}

export interface CreateControleTesteInput {
  tenantId: number
  controleId: number
  tipoTeste: string
  periodoReferencia: string | null
  amostraJson: unknown
  resultadoTeste: string
  falhasIdentificadas: string | null
  efetividadeScore: number | null
  executadoPor: number
  conclusao: string | null
}

export interface CreateRiscoControleInput {
  tenantId: number
  riscoId: number
  controleId: number
  papelControle: string
  pesoMitigacao: number
}

export interface RiscoControleRow {
  controleId: number
  pesoMitigacao: number
}

export interface ControleTesteRow {
  efetividadeScore: number | null
  resultadoTeste: string | null
}

export interface CreateAuditoriaInput {
  tenantId: number
  codigo: string
  nome: string
  tipoAuditoria: string
  statusAuditoria: string
  escopoDescricao: string | null
  ownerUserId: number
  auditorLiderUserId: number | null
  dataInicioPlanejada: Date | null
  dataFimPlanejada: Date | null
}

export interface UpdateAuditoriaInput {
  statusAuditoria?: string
  dataFimReal?: Date | null
  opiniaoFinal?: string | null
  ratingFinal?: string | null
}

export interface CreateAchadoInput {
  tenantId: number
  auditoriaId: number | null
  riscoId: number | null
  controleId: number | null
  incidenteId: number | null
  criseId: number | null
  titulo: string
  descricao: string | null
  gravidade: string
  statusAchado: string
  causaRaiz: string | null
  impactoResumo: string | null
  recomendacao: string | null
  ownerUserId: number
  prazoTratativaEm: Date | null
}

export interface UpdateAchadoInput {
  statusAchado?: string
}

export interface CreatePlanoAcaoInput {
  tenantId: number
  origemTipo: string
  origemId: number
  titulo: string
  descricao: string | null
  statusPlano: string
  criticidade: string
  ownerUserId: number
  aprovadorUserId: number | null
  dataLimite: Date | null
  resultadoEsperado: string | null
  criterioAceite: string | null
}

export interface UpdatePlanoAcaoInput {
  statusPlano?: string
  aprovadorUserId?: number
  concluidoEm?: Date
}

export interface CreateEvidenciaInput {
  tenantId: number
  referenciaTipo: string
  referenciaId: number
  tipoEvidencia: string
  titulo: string | null
  descricao: string | null
  arquivoPath: string | null
  hashSha256: string | null
  coletadoPor: number
  metadataJson: unknown
}

export interface IGrcRepository {
  // ── grcRisco ──────────────────────────────────────────────────────────────
  findManyRiscos(where: GrcRiscoWhere, pagination: PaginationOptions): Promise<unknown[]>
  countRiscos(where: GrcRiscoWhere): Promise<number>
  createRisco(input: CreateRiscoInput): Promise<{ id: number; codigo: string; categoriaRisco: string; scoreInerente: number }>
  findUniqueRisco(id: number): Promise<(CreateRiscoInput & { id: number; scoreInerente: number; impactoInerente: string; probabilidadeInerente: string; impactoResidual: string | null; probabilidadeResidual: string | null; scoreResidual: number | null }) | null>
  updateRisco(id: number, data: UpdateRiscoInput): Promise<void>

  // ── grcRiscoAvaliacao ──────────────────────────────────────────────────────
  findManyRiscoAvaliacoes(tenantId: number, riscoId: number): Promise<unknown[]>
  createRiscoAvaliacao(input: CreateRiscoAvaliacaoInput): Promise<void>

  // ── addAvaliacaoTransaction (wraps $transaction) ───────────────────────────
  addAvaliacaoTransaction(input: AddAvaliacaoTransactionInput): Promise<void>

  // ── grcControleTeste ──────────────────────────────────────────────────────
  findFirstControleTeste(tenantId: number, controleId: number): Promise<ControleTesteRow | null>
  createControleTeste(input: CreateControleTesteInput): Promise<{ id: number }>

  // ── grcControle ───────────────────────────────────────────────────────────
  findManyControles(where: GrcControleWhere, pagination: PaginationOptions): Promise<unknown[]>
  countControles(where: GrcControleWhere): Promise<number>
  createControle(input: CreateControleInput): Promise<{ id: number }>
  findUniqueControle(id: number): Promise<{ id: number; tenantId: number } | null>

  // ── grcRiscoControle ──────────────────────────────────────────────────────
  createRiscoControle(input: CreateRiscoControleInput): Promise<void>
  findManyRiscoControles(tenantId: number, riscoId: number): Promise<RiscoControleRow[]>

  // ── grcAuditoria ──────────────────────────────────────────────────────────
  findManyAuditorias(where: GrcAuditoriaWhere, pagination: PaginationOptions): Promise<unknown[]>
  countAuditorias(where: GrcAuditoriaWhere): Promise<number>
  createAuditoria(input: CreateAuditoriaInput): Promise<{ id: number }>
  findUniqueAuditoria(id: number): Promise<{ id: number; tenantId: number } | null>
  updateAuditoria(id: number, data: UpdateAuditoriaInput): Promise<void>

  // ── grcAchado ─────────────────────────────────────────────────────────────
  findManyAchados(where: GrcAchadoWhere, pagination: PaginationOptions): Promise<unknown[]>
  countAchados(where: GrcAchadoWhere): Promise<number>
  createAchado(input: CreateAchadoInput): Promise<{ id: number }>
  findUniqueAchado(id: number): Promise<{ id: number; tenantId: number } | null>
  updateAchado(id: number, data: UpdateAchadoInput): Promise<void>

  // ── grcPlanoAcao ──────────────────────────────────────────────────────────
  findManyPlanosAcao(where: GrcPlanoAcaoWhere, pagination: PaginationOptions): Promise<unknown[]>
  countPlanosAcao(where: GrcPlanoAcaoWhere): Promise<number>
  createPlanoAcao(input: CreatePlanoAcaoInput): Promise<{ id: number }>
  findUniquePlanoAcao(id: number): Promise<{ id: number; tenantId: number } | null>
  updatePlanoAcao(id: number, data: UpdatePlanoAcaoInput): Promise<void>

  // ── grcEvidencia ──────────────────────────────────────────────────────────
  findManyEvidencias(where: GrcEvidenciaWhere, pagination: PaginationOptions): Promise<unknown[]>
  countEvidencias(where: GrcEvidenciaWhere): Promise<number>
  createEvidencia(input: CreateEvidenciaInput): Promise<{ id: number }>

  // ── tenantUser (auth check) ────────────────────────────────────────────────
  findTenantUser(tenantId: number, userId: number): Promise<{ role: string } | null>
}
