import type {
  PlaybookApprovalPolicy,
  PlaybookExecutionStatus,
  PlaybookMode,
  PlaybookRiskLevel,
} from '@/modules/playbooks/types.js'

// ─── Playbook ────────────────────────────────────────────────────────────────

export interface ListPlaybooksFilter {
  ativo?: boolean
  pagina?: number
  limite?: number
}

export interface CreatePlaybookInput {
  codigo: string
  nome: string
  descricao?: string | null
  categoria?: string | null
  modoExecucao: PlaybookMode
  gatilhoTipo: string
  filtroEventoJson?: unknown
  filtroAlertaJson?: unknown
  filtroIncidenteJson?: unknown
  riscoPadrao: PlaybookRiskLevel
  politicaAprovacao: PlaybookApprovalPolicy
  ativo: boolean
  ordemPrioridade: number
  passos?: CreatePlaybookStepInput[]
}

export interface CreatePlaybookStepInput {
  ordemExecucao: number
  tipoAcao: string
  nomePasso: string
  descricao?: string | null
  configuracaoJson?: unknown
  timeoutSegundos?: number | null
  continuaEmErro?: boolean
  reversivel?: boolean
  acaoCompensacaoJson?: unknown
  riscoAcao: PlaybookRiskLevel
}

export interface UpdatePlaybookInput {
  nome?: string
  descricao?: string | null
  categoria?: string | null
  modoExecucao?: PlaybookMode
  gatilhoTipo?: string
  filtroEventoJson?: unknown
  filtroAlertaJson?: unknown
  filtroIncidenteJson?: unknown
  riscoPadrao?: PlaybookRiskLevel
  politicaAprovacao?: PlaybookApprovalPolicy
  ativo?: boolean
  ordemPrioridade?: number
  passos?: CreatePlaybookStepInput[]
}

// ─── Execução ────────────────────────────────────────────────────────────────

export interface ListExecucoesFilter {
  status?: string
  pagina?: number
  limite?: number
}

export interface CreateExecucaoInput {
  playbookId: number
  alertaId?: number | null
  incidenteId?: number | null
  eventoOrigemId?: number | null
  modoExecucao: PlaybookMode
  statusExecucao: PlaybookExecutionStatus
  chaveIdempotencia: string
  aprovacaoExigida: boolean
  executadoPorUserId: number
  iniciadoEm?: Date | null
}

export interface UpdateExecucaoInput {
  statusExecucao?: PlaybookExecutionStatus
  aprovadoPorUserId?: number | null
  aprovadoEm?: Date | null
  iniciadoEm?: Date | null
  finalizadoEm?: Date | null
  resultadoResumoJson?: unknown
}

export interface CreateExecucaoPassoInput {
  execucaoId: number
  passoId: number
  ordemExecucao: number
  statusPasso: string
  iniciadoEm?: Date | null
  finalizadoEm?: Date | null
  entradaRedactedJson?: unknown
  saidaRedactedJson?: unknown
  erroResumo?: string | null
}

// ─── Incidente ───────────────────────────────────────────────────────────────

export interface CreateIncidenteTimelineInput {
  incidenteId: number
  tipoEventoTimeline: string
  titulo: string
  descricao?: string | null
  autorUserId: number
  metadataJson?: unknown
}

// ─── Caso Compliance ─────────────────────────────────────────────────────────

export interface ListCasosComplianceFilter {
  status?: string
  pagina?: number
  limite?: number
}

export interface CreateCasoComplianceInput {
  incidenteId?: number | null
  tipoCaso: string
  statusCaso?: string
  criticidade: string
  ownerUserId?: number | null
  prazoRespostaEm?: Date | null
  prazoConclusaoEm?: Date | null
}

export interface UpdateCasoComplianceInput {
  statusCaso?: string
  parecerFinal?: string
}

export interface CreateEvidenciaInput {
  casoId: number
  tipoEvidencia: string
  referenciaTipo?: string | null
  referenciaId?: number | null
  descricao?: string | null
  arquivoPath?: string | null
  hashSha256?: string | null
  metadataJson?: unknown
}

// ─── Repository interface ─────────────────────────────────────────────────────

export interface IPlaybooksRepository {
  // Playbook CRUD
  listPlaybooks(tenantId: number, filter?: ListPlaybooksFilter): Promise<unknown[]>
  countPlaybooks(tenantId: number, filter?: ListPlaybooksFilter): Promise<number>
  getPlaybookById(tenantId: number, id: number): Promise<unknown>
  createPlaybook(tenantId: number, input: CreatePlaybookInput): Promise<unknown>
  updatePlaybook(tenantId: number, id: number, input: UpdatePlaybookInput): Promise<unknown>

  // Playbook with passos (for simulation/execution logic)
  getPlaybookWithSteps(tenantId: number, id: number): Promise<unknown>

  // Execução CRUD
  listExecucoes(tenantId: number, filter?: ListExecucoesFilter): Promise<unknown[]>
  countExecucoes(tenantId: number, filter?: ListExecucoesFilter): Promise<number>
  getExecucaoById(tenantId: number, id: number): Promise<unknown>
  getExecucaoWithPlaybook(tenantId: number, id: number): Promise<unknown>
  findExecucaoByIdempotencyKey(tenantId: number, chaveIdempotencia: string): Promise<unknown>
  createExecucao(tenantId: number, input: CreateExecucaoInput): Promise<unknown>
  updateExecucao(tenantId: number, id: number, input: UpdateExecucaoInput): Promise<unknown>

  // Execução Passo
  createExecucaoPasso(tenantId: number, input: CreateExecucaoPassoInput): Promise<unknown>
  updateExecucaoPasso(tenantId: number, id: number, input: Partial<CreateExecucaoPassoInput>): Promise<unknown>

  // Incidente (read)
  getIncidenteById(tenantId: number, id: number): Promise<unknown>

  // Incidente Timeline
  listIncidenteTimeline(tenantId: number, incidenteId: number): Promise<unknown[]>
  createIncidenteTimeline(tenantId: number, input: CreateIncidenteTimelineInput): Promise<unknown>

  // Caso Compliance
  listCasosCompliance(tenantId: number, filter?: ListCasosComplianceFilter): Promise<unknown[]>
  countCasosCompliance(tenantId: number, filter?: ListCasosComplianceFilter): Promise<number>
  getCasoComplianceById(tenantId: number, id: number): Promise<unknown>
  createCasoCompliance(tenantId: number, input: CreateCasoComplianceInput): Promise<unknown>
  updateCasoCompliance(tenantId: number, id: number, input: UpdateCasoComplianceInput): Promise<unknown>

  // Evidência
  createEvidencia(tenantId: number, input: CreateEvidenciaInput): Promise<unknown>

  // TenantUser (for requireAdmin check)
  getTenantUserRole(tenantId: number, userId: number): Promise<string | null>
}
