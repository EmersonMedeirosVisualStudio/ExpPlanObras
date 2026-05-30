export interface ListContratosFilter {
  mainContractsOnly?: boolean
  papel?: string | null
}

export interface DashboardFilter {
  status?: string | null
  papel?: string | null
  contractorType?: string | null
}

export interface FaturamentoFilter {
  start: string
  end: string
  contratoId?: number | null
  empresa?: string | null
}

export interface EventoFilter {
  originTypes?: string[]
  includeObservations?: boolean
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
  getRevenue(tenantId: number, filter: FaturamentoFilter): Promise<unknown>
  getConsolidated(tenantId: number, id: number): Promise<unknown>
  ensurePending(tenantId: number): Promise<unknown>

  // Sub-resources (subcontratos)
  getSubcontractsSummary(tenantId: number, contratoId: number): Promise<unknown>
  listSubcontracts(tenantId: number, contratoId: number): Promise<unknown[]>
  createSubcontract(tenantId: number, contratoId: number, input: unknown): Promise<unknown>
  updateSubcontract(tenantId: number, contratoId: number, subId: number, input: unknown): Promise<unknown>
  deleteSubcontract(tenantId: number, contratoId: number, subId: number): Promise<unknown>

  // Medições
  listMeasurements(tenantId: number, contratoId: number): Promise<unknown[]>
  createMeasurement(tenantId: number, contratoId: number, input: { date: string; amount: number; status?: string | null }): Promise<unknown>
  updateMeasurementStatus(tenantId: number, contratoId: number, medicaoId: number, input: { status: string }): Promise<unknown>

  // Pagamentos
  listPayments(tenantId: number, contratoId: number): Promise<unknown[]>
  createPayment(tenantId: number, contratoId: number, input: { date: string; amount: number; medicaoId?: number | null }): Promise<unknown>
  deletePayment(tenantId: number, contratoId: number, pagamentoId: number): Promise<unknown>

  // Programação financeira
  listFinancialSchedule(tenantId: number, contratoId: number): Promise<unknown[]>
  createFinancialScheduleItem(tenantId: number, contratoId: number, input: { competencia: string; valorPrevisto: number }): Promise<unknown>
  updateFinancialScheduleItem(tenantId: number, contratoId: number, itemId: number, input: { competencia: string; valorPrevisto: number }): Promise<unknown>
  deleteFinancialScheduleItem(tenantId: number, contratoId: number, itemId: number): Promise<unknown>

  // Aditivos
  listAddenda(tenantId: number, contratoId: number): Promise<unknown[]>
  createAddendum(tenantId: number, contratoId: number, input: unknown): Promise<unknown>
  updateAddendum(tenantId: number, contratoId: number, aditivoId: number, input: unknown): Promise<unknown>
  approveAddendum(tenantId: number, contratoId: number, aditivoId: number): Promise<unknown>
  cancelAddendum(tenantId: number, contratoId: number, aditivoId: number): Promise<unknown>

  // Eventos e observações
  listEvents(tenantId: number, contratoId: number, filter?: EventoFilter): Promise<unknown[]>
  createObservation(tenantId: number, contratoId: number, input: unknown): Promise<unknown>
  addEventAttachment(tenantId: number, contratoId: number, eventoId: number, input: unknown): Promise<unknown>
  downloadEventAttachment(tenantId: number, contratoId: number, eventoId: number, anexoId: number): Promise<unknown>

  // Serviços e cronograma
  listServices(tenantId: number, contratoId: number): Promise<unknown[]>
  createService(tenantId: number, contratoId: number, input: unknown): Promise<unknown>
  getSchedule(tenantId: number, contratoId: number): Promise<unknown>
  seedSchedule(tenantId: number, contratoId: number, input?: { duracaoDiasPadrao?: number | null }): Promise<unknown>
  updateScheduleItem(tenantId: number, contratoId: number, itemId: number, input: { dataInicio: string; dataFim: string }): Promise<unknown>
  createScheduleDependency(tenantId: number, contratoId: number, input: { origemItemId: number; destinoItemId: number; tipo?: string | null }): Promise<unknown>
  deleteScheduleDependency(tenantId: number, contratoId: number, depId: number): Promise<unknown>
}
