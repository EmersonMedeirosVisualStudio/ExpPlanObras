// ─── Pagination helpers ──────────────────────────────────────────────────────

export interface PaginationInput {
  pagina: number
  limite: number
}

export interface PaginatedResult<T> {
  rows: T[]
  total: number
}

// ─── Pii Scan ────────────────────────────────────────────────────────────────

export interface ListPiiScansFilter extends PaginationInput {
  status?: string
}

export interface PiiScanResultRow {
  id: number
  scanId: number
  tenantId: number
  ativoId: number
  campoId: number
  tipoDetectado: string
  nivelConfianca: string
  statusResultado: string
  amostraMascarada: string | null
  regraDetector: string
  sugestaoClassificacao: string
  metadataJson: unknown
  campo: { id: number; caminhoCampo: string } | null
}

// ─── Classificacao ───────────────────────────────────────────────────────────

export interface ListClassificacaoSugestoesFilter extends PaginationInput {
  status?: string
}

export interface ClassificacaoSugestaoRow {
  id: number
  tenantId: number
  ativoId: number
  campoId: number | null
  origemSugestao: string
  classificacaoSugerida: string
  categoriaSugerida: string | null
  scoreConfianca: number | null
  statusSugestao: string
  createdAt: Date
  ativo: { id: number; codigoAtivo: string; nomeAtivo: string } | null
  campo: { id: number; caminhoCampo: string } | null
}

// ─── Dominio ─────────────────────────────────────────────────────────────────

export interface DominioRow {
  id: number
  tenantId: number
  codigoDominio: string
  nomeDominio: string
  descricaoDominio: string | null
  ativo: boolean
}

export interface CreateDominioInput {
  codigoDominio: string
  nomeDominio: string
  descricaoDominio?: string | null
  ativo: boolean
}

// ─── Ativo ────────────────────────────────────────────────────────────────────

export interface ListAtivosFilter extends PaginationInput {
  tipo?: string
  dominioId?: number
}

export interface AtivoListRow {
  id: number
  codigoAtivo: string
  nomeAtivo: string
  tipoAtivo: string
  classificacaoGlobal: string
  criticidadeNegocio: string
  statusAtivo: string
  slaFreshnessMinutos: number | null
  dominio: { nomeDominio: string } | null
  ownerNegocio: { name: string } | null
  ownerTecnico: { name: string } | null
}

export interface AtivoDetailRow {
  id: number
  codigoAtivo: string
  nomeAtivo: string
  tipoAtivo: string
  descricaoAtivo: string | null
  origemSistema: string | null
  schemaNome: string | null
  objetoNome: string | null
  datasetKey: string | null
  classificacaoGlobal: string
  criticidadeNegocio: string
  slaFreshnessMinutos: number | null
  statusAtivo: string
  tenantId: number
  metadataJson: unknown
  createdAt: Date
  updatedAt: Date
  dominio: { codigoDominio: string; nomeDominio: string } | null
  ownerNegocio: { id: number; name: string } | null
  ownerTecnico: { id: number; name: string } | null
  steward: { id: number; name: string } | null
  custodiante: { id: number; name: string } | null
}

export interface CreateAtivoInput {
  codigoAtivo: string
  nomeAtivo: string
  tipoAtivo: string
  dominioId?: number | null
  classificacaoGlobal: string
  criticidadeNegocio: string
  schemaNome?: string | null
  objetoNome?: string | null
  datasetKey?: string | null
  origemSistema?: string | null
}

// ─── Ativo Campo ──────────────────────────────────────────────────────────────

export interface AtivoCampoRow {
  id: number
  ativoId: number
  caminhoCampo: string
  nomeCampoExibicao: string
  tipoDado: string
  descricaoCampo: string | null
  classificacaoCampo: string
  pii: boolean
  campoChave: boolean
  campoObrigatorio: boolean
  campoMascaravel: boolean
  estrategiaMascaraPadrao: string | null
  origemCampo: string | null
  ativo: boolean
  metadataJson: unknown
}

export interface UpsertAtivoCampoInput {
  ativoId: number
  caminhoCampo: string
  nomeCampoExibicao: string
  tipoDado: string
  descricaoCampo?: string | null
  classificacaoCampo: string
  pii: boolean
  campoChave: boolean
  campoObrigatorio: boolean
  campoMascaravel: boolean
  estrategiaMascaraPadrao?: string | null
  origemCampo?: string | null
  ativo: boolean
  metadataJson?: unknown
}

// ─── Lineage ─────────────────────────────────────────────────────────────────

export interface LineageRelacaoRow {
  id: number
  tenantId: number
  ativoOrigemId: number
  ativoDestinoId: number
  tipoRelacao: string
  nivelRelacao: string
  campoOrigem: string | null
  campoDestino: string | null
  ativoOrigem: { id: number; nomeAtivo: string }
  ativoDestino: { id: number; nomeAtivo: string }
}

export interface CreateLineageInput {
  ativoOrigemId: number
  ativoDestinoId: number
  tipoRelacao: string
  nivelRelacao: string
  campoOrigem?: string | null
  campoDestino?: string | null
  transformacaoResumo?: string | null
  pipelineNome?: string | null
  ativo: boolean
}

// ─── Glossario ────────────────────────────────────────────────────────────────

export interface ListGlossarioFilter extends PaginationInput {
  termo?: string
  dominioId?: number
}

export interface GlossarioRow {
  id: number
  tenantId: number
  termo: string
  definicao: string
  formulaNegocio: string | null
  exemplosJson: unknown
  dominioId: number | null
  ownerUserId: number | null
  ativo: boolean
  createdAt: Date
  updatedAt: Date
  dominio: { codigoDominio: string; nomeDominio: string } | null
  ownerRef: { id: number; name: string } | null
}

export interface CreateGlossarioInput {
  termo: string
  definicao: string
  formulaNegocio?: string | null
  exemplosJson?: unknown
  dominioId?: number | null
  ownerUserId?: number | null
  ativo: boolean
}

// ─── Qualidade Regra ──────────────────────────────────────────────────────────

export interface ListQualidadeRegraFilter extends PaginationInput {
  ativoId?: number
}

export interface QualidadeRegraRow {
  id: number
  tenantId: number
  ativoId: number
  caminhoCampo: string | null
  nomeRegra: string
  tipoRegra: string
  severidade: string
  configuracaoJson: unknown
  thresholdOk: number | null
  thresholdAlerta: number | null
  ativo: boolean
  criadoPorUserId: number | null
  atualizadoPorUserId: number | null
}

export interface CreateQualidadeRegraInput {
  ativoId: number
  caminhoCampo?: string | null
  nomeRegra: string
  tipoRegra: string
  severidade: string
  configuracaoJson: unknown
  thresholdOk?: number | null
  thresholdAlerta?: number | null
  ativo: boolean
  criadoPorUserId: number
  atualizadoPorUserId: number
}

export interface UpdateQualidadeRegraInput {
  caminhoCampo?: string | null
  nomeRegra: string
  tipoRegra: string
  severidade: string
  configuracaoJson: unknown
  thresholdOk?: number | null
  thresholdAlerta?: number | null
  ativo: boolean
  atualizadoPorUserId: number
}

// ─── Qualidade Execucao ────────────────────────────────────────────────────────

export interface CreateQualidadeExecucaoInput {
  tenantId: number
  regraId: number
  statusExecucao: string
  valorApurado?: number | null
  thresholdOk?: number | null
  thresholdAlerta?: number | null
  totalRegistros?: number | null
  totalInconsistencias?: number | null
  amostraJson?: unknown
  mensagemResultado?: string | null
}

export interface QualidadeExecucaoRow {
  id: number
  tenantId: number
  regraId: number
  statusExecucao: string
  valorApurado: number | null
  mensagemResultado: string | null
}

// ─── Qualidade Issue ──────────────────────────────────────────────────────────

export interface ListQualidadeIssuesFilter extends PaginationInput {
  status?: string
  severidade?: string
  ativoId?: number
}

export interface QualidadeIssueRow {
  id: number
  tenantId: number
  ativoId: number
  regraId: number | null
  tituloIssue: string
  descricaoIssue: string | null
  severidade: string
  statusIssue: string
  responsavelUserId: number | null
  primeiraOcorrenciaEm: Date
  ultimaOcorrenciaEm: Date
  metadataJson: unknown
  responsavelRef: { name: string } | null
  ativoRef: { nomeAtivo: string; codigoAtivo: string } | null
}

export interface CreateQualidadeIssueInput {
  tenantId: number
  ativoId: number
  regraId: number
  tituloIssue: string
  descricaoIssue?: string | null
  severidade: string
  statusIssue: string
  responsavelUserId?: number | null
  primeiraOcorrenciaEm: Date
  ultimaOcorrenciaEm: Date
  metadataJson?: unknown
}

export interface UpdateQualidadeIssueInput {
  ultimaOcorrenciaEm?: Date
  severidade?: string
  metadataJson?: unknown
  statusIssue?: string
}

// ─── TenantUser (auth check) ──────────────────────────────────────────────────

export interface TenantUserRow {
  role: string
}

// ─── Dynamic Rule Execution ───────────────────────────────────────────────────

export interface ExecutarRegraQualidadeDinamicaInput {
  tipo: string
  objeto: string | null
  regra: QualidadeRegraRow
  ativo: { id: number; tenantId: number; objetoNome: string | null; slaFreshnessMinutos: number | null }
}

export interface ExecutarRegraQualidadeDinamicaResult {
  statusExecucao: 'OK' | 'ALERTA' | 'FALHA' | 'ERRO'
  totalRegistros: number | null
  totalInconsistencias: number | null
  valorApurado: number | null
  mensagemResultado: string | null
}

// ─── Repository Interface ────────────────────────────────────────────────────

export interface IGovernancaDadosRepository {
  // Pii Scan
  listPiiScans(tenantId: number, filter: ListPiiScansFilter): Promise<PaginatedResult<unknown>>
  getPiiScanById(tenantId: number, id: number): Promise<unknown | null>
  listPiiScanResultados(tenantId: number, scanId: number): Promise<PiiScanResultRow[]>

  // Classificacao
  listClassificacaoSugestoes(tenantId: number, filter: ListClassificacaoSugestoesFilter): Promise<PaginatedResult<ClassificacaoSugestaoRow>>

  // Dominio
  listDominios(tenantId: number): Promise<DominioRow[]>
  createDominio(tenantId: number, input: CreateDominioInput): Promise<{ id: number }>
  findDominioByCode(tenantId: number, codigoDominio: string): Promise<DominioRow | null>

  // Ativo
  listAtivos(tenantId: number, filter: ListAtivosFilter): Promise<PaginatedResult<AtivoListRow>>
  getAtivoById(tenantId: number, id: number): Promise<AtivoDetailRow | null>
  createAtivo(tenantId: number, input: CreateAtivoInput): Promise<{ id: number }>
  findAtivoRaw(id: number): Promise<{ id: number; tenantId: number; objetoNome: string | null; slaFreshnessMinutos: number | null } | null>

  // Ativo Campo
  listAtivoCampos(ativoId: number): Promise<AtivoCampoRow[]>
  upsertAtivoCampo(input: UpsertAtivoCampoInput): Promise<AtivoCampoRow>

  // Lineage
  listLineageByAtivo(tenantId: number, ativoId: number): Promise<LineageRelacaoRow[]>
  createLineage(tenantId: number, input: CreateLineageInput): Promise<{ id: number }>

  // Glossario
  listGlossario(tenantId: number, filter: ListGlossarioFilter): Promise<PaginatedResult<GlossarioRow>>
  createGlossario(tenantId: number, input: CreateGlossarioInput): Promise<{ id: number }>

  // Qualidade Regra
  listQualidadeRegras(tenantId: number, filter: ListQualidadeRegraFilter): Promise<PaginatedResult<QualidadeRegraRow>>
  listQualidadeRegrasByAtivo(tenantId: number, ativoId: number): Promise<QualidadeRegraRow[]>
  getQualidadeRegraById(tenantId: number, id: number): Promise<QualidadeRegraRow | null>
  createQualidadeRegra(tenantId: number, input: CreateQualidadeRegraInput): Promise<{ id: number }>
  updateQualidadeRegra(tenantId: number, id: number, input: UpdateQualidadeRegraInput): Promise<{ id: number }>

  // Qualidade Execucao
  createQualidadeExecucao(input: CreateQualidadeExecucaoInput): Promise<QualidadeExecucaoRow>

  // Qualidade Issue
  listQualidadeIssues(tenantId: number, filter: ListQualidadeIssuesFilter): Promise<PaginatedResult<QualidadeIssueRow>>
  listQualidadeIssuesByAtivo(tenantId: number, ativoId: number): Promise<QualidadeIssueRow[]>
  findOpenIssueByRegra(tenantId: number, ativoId: number, regraId: number): Promise<QualidadeIssueRow | null>
  updateQualidadeIssue(tenantId: number, id: number, input: UpdateQualidadeIssueInput): Promise<void>
  createQualidadeIssue(input: CreateQualidadeIssueInput): Promise<{ id: number }>

  // Auth check
  findTenantUser(tenantId: number, userId: number): Promise<TenantUserRow | null>

  // Dynamic rule execution (infra-side business logic for dynamic Prisma model access)
  executarRegraQualidadeDinamica(input: ExecutarRegraQualidadeDinamicaInput): Promise<ExecutarRegraQualidadeDinamicaResult>
}
