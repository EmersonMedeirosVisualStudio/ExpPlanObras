export interface ListContratosFilter {
  apenasPrincipais?: boolean
  papel?: string | null
}

export interface DashboardFilter {
  status?: string | null
  papel?: string | null
  tipoContratante?: string | null
}

export interface FaturamentoFilter {
  start: string
  end: string
  contratoId?: number | null
  empresa?: string | null
}

export interface EventoFilter {
  tiposOrigem?: string[]
  incluirObservacoes?: boolean
  limit?: number
  texto?: string
  desde?: string
  ate?: string
}

export interface IContratoRepository {
  // Core CRUD
  list(tenantId: number, filter?: ListContratosFilter): Promise<unknown[]>
  getById(tenantId: number, id: number): Promise<unknown>
  create(tenantId: number, input: unknown): Promise<unknown>
  update(tenantId: number, id: number, input: unknown): Promise<unknown>

  // Read-heavy queries
  getDashboard(tenantId: number, filter?: DashboardFilter): Promise<unknown>
  getFaturamento(tenantId: number, filter: FaturamentoFilter): Promise<unknown>
  getConsolidado(tenantId: number, id: number): Promise<unknown>
  ensurePendente(tenantId: number): Promise<unknown>

  // Sub-resources (subcontratos)
  getSubcontratosResumo(tenantId: number, contratoId: number): Promise<unknown>
  listSubcontratos(tenantId: number, contratoId: number): Promise<unknown[]>
  createSubcontrato(tenantId: number, contratoId: number, input: unknown): Promise<unknown>
  updateSubcontrato(tenantId: number, contratoId: number, subId: number, input: unknown): Promise<unknown>
  deleteSubcontrato(tenantId: number, contratoId: number, subId: number): Promise<unknown>

  // Medições
  listMedicoes(tenantId: number, contratoId: number): Promise<unknown[]>
  createMedicao(tenantId: number, contratoId: number, input: { date: string; amount: number; status?: string | null }): Promise<unknown>
  updateMedicaoStatus(tenantId: number, contratoId: number, medicaoId: number, input: { status: string }): Promise<unknown>

  // Pagamentos
  listPagamentos(tenantId: number, contratoId: number): Promise<unknown[]>
  createPagamento(tenantId: number, contratoId: number, input: { date: string; amount: number; medicaoId?: number | null }): Promise<unknown>
  deletePagamento(tenantId: number, contratoId: number, pagamentoId: number): Promise<unknown>

  // Programação financeira
  listProgramacaoFinanceira(tenantId: number, contratoId: number): Promise<unknown[]>
  createProgramacaoFinanceira(tenantId: number, contratoId: number, input: { competencia: string; valorPrevisto: number }): Promise<unknown>
  updateProgramacaoFinanceira(tenantId: number, contratoId: number, itemId: number, input: { competencia: string; valorPrevisto: number }): Promise<unknown>
  deleteProgramacaoFinanceira(tenantId: number, contratoId: number, itemId: number): Promise<unknown>

  // Aditivos
  listAditivos(tenantId: number, contratoId: number): Promise<unknown[]>
  createAditivo(tenantId: number, contratoId: number, input: unknown): Promise<unknown>
  updateAditivo(tenantId: number, contratoId: number, aditivoId: number, input: unknown): Promise<unknown>
  aprovarAditivo(tenantId: number, contratoId: number, aditivoId: number): Promise<unknown>
  cancelarAditivo(tenantId: number, contratoId: number, aditivoId: number): Promise<unknown>

  // Eventos e observações
  listEventos(tenantId: number, contratoId: number, filter?: EventoFilter): Promise<unknown[]>
  createObservacao(tenantId: number, contratoId: number, input: unknown): Promise<unknown>
  addEventoAnexo(tenantId: number, contratoId: number, eventoId: number, input: unknown): Promise<unknown>
  downloadEventoAnexo(tenantId: number, contratoId: number, eventoId: number, anexoId: number): Promise<unknown>

  // Serviços e cronograma
  listServicos(tenantId: number, contratoId: number): Promise<unknown[]>
  createServico(tenantId: number, contratoId: number, input: unknown): Promise<unknown>
  getCronograma(tenantId: number, contratoId: number): Promise<unknown>
  seedCronograma(tenantId: number, contratoId: number, input?: { duracaoDiasPadrao?: number | null }): Promise<unknown>
  updateCronogramaItem(tenantId: number, contratoId: number, itemId: number, input: { dataInicio: string; dataFim: string }): Promise<unknown>
  createCronogramaDependencia(tenantId: number, contratoId: number, input: { origemItemId: number; destinoItemId: number; tipo?: string | null }): Promise<unknown>
  deleteCronogramaDependencia(tenantId: number, contratoId: number, depId: number): Promise<unknown>
}
