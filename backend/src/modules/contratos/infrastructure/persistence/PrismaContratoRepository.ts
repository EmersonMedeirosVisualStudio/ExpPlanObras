import type { DashboardFilter, EventoFilter, FaturamentoFilter, IContratoRepository, ListContratosFilter } from '@/modules/contratos/domain/ports/IContratoRepository.js'
import {
  addContratoEventoAnexo,
  aprovarContratoAditivo,
  cancelarContratoAditivo,
  createContrato,
  createContratoAditivo,
  createCronogramaDependencia as createScheduleDependency,
  createContratoMedicao,
  createContratoObservacao,
  createContratoPagamento,
  createContratoProgramacaoFinanceira,
  createContratoServico,
  createSubcontrato as createSubcontract,
  deleteCronogramaDependencia as deleteScheduleDependency,
  deleteContratoPagamento,
  deleteContratoProgramacaoFinanceira,
  deleteSubcontrato as deleteSubcontract,
  downloadContratoEventoAnexo,
  ensureContratoPendente,
  getContratoById,
  getContratoConsolidado,
  getContratoCronograma,
  getContratosDashboard,
  getContratosFaturamento,
  getSubcontratosResumo as getSubcontractsSummary,
  listContratoAditivos,
  listContratoEventos,
  listContratoMedicoes,
  listContratoPagamentos,
  listContratoProgramacaoFinanceira,
  listContratos,
  listContratoServicos,
  listSubcontratos as listSubcontracts,
  seedCronogramaFromServicos,
  updateContrato,
  updateContratoAditivo,
  updateContratoMedicaoStatus,
  updateContratoProgramacaoFinanceira,
  updateCronogramaItemDatas,
  updateSubcontrato as updateSubcontract,
} from '@/modules/contratos/infrastructure/services/contratosOps.js'

export class PrismaContratoRepository implements IContratoRepository {
  async list(tenantId: number, filter?: ListContratosFilter) {
    return listContratos(tenantId, filter)
  }
  async getById(tenantId: number, id: number) {
    return getContratoById(tenantId, id)
  }
  async create(tenantId: number, input: unknown) {
    return createContrato(tenantId, input as Parameters<typeof createContrato>[1])
  }
  async update(tenantId: number, id: number, input: unknown) {
    return updateContrato(tenantId, id, input as Parameters<typeof updateContrato>[2])
  }
  async getDashboard(tenantId: number, filter?: DashboardFilter) {
    return getContratosDashboard(tenantId, filter)
  }
  async getRevenue(tenantId: number, filter: FaturamentoFilter) {
    return getContratosFaturamento(tenantId, filter)
  }
  async getConsolidated(tenantId: number, id: number) {
    return getContratoConsolidado(tenantId, id)
  }
  async ensurePending(tenantId: number) {
    return ensureContratoPendente(tenantId)
  }

  // Subcontratos
  async getSubcontractsSummary(tenantId: number, contratoId: number) {
    return getSubcontractsSummary(tenantId, contratoId)
  }
  async listSubcontracts(tenantId: number, contratoId: number) {
    return listSubcontracts(tenantId, contratoId)
  }
  async createSubcontract(tenantId: number, contratoId: number, input: unknown) {
    return createSubcontract(tenantId, contratoId, input as Parameters<typeof createSubcontract>[2])
  }
  async updateSubcontract(tenantId: number, contratoId: number, subId: number, input: unknown) {
    return updateSubcontract(tenantId, contratoId, subId, input as Parameters<typeof updateSubcontract>[3])
  }
  async deleteSubcontract(tenantId: number, contratoId: number, subId: number) {
    return deleteSubcontract(tenantId, contratoId, subId)
  }

  // Medições
  async listMeasurements(tenantId: number, contratoId: number) {
    return listContratoMedicoes(tenantId, contratoId)
  }
  async createMeasurement(tenantId: number, contratoId: number, input: { date: string; amount: number; status?: string | null }) {
    return createContratoMedicao(tenantId, contratoId, input)
  }
  async updateMeasurementStatus(tenantId: number, contratoId: number, medicaoId: number, input: { status: string }) {
    return updateContratoMedicaoStatus(tenantId, contratoId, medicaoId, input)
  }

  // Pagamentos
  async listPayments(tenantId: number, contratoId: number) {
    return listContratoPagamentos(tenantId, contratoId)
  }
  async createPayment(tenantId: number, contratoId: number, input: { date: string; amount: number; medicaoId?: number | null }) {
    return createContratoPagamento(tenantId, contratoId, input)
  }
  async deletePayment(tenantId: number, contratoId: number, pagamentoId: number) {
    return deleteContratoPagamento(tenantId, contratoId, pagamentoId)
  }

  // Programação financeira
  async listFinancialSchedule(tenantId: number, contratoId: number) {
    return listContratoProgramacaoFinanceira(tenantId, contratoId)
  }
  async createFinancialScheduleItem(tenantId: number, contratoId: number, input: { competencia: string; valorPrevisto: number }) {
    return createContratoProgramacaoFinanceira(tenantId, contratoId, input)
  }
  async updateFinancialScheduleItem(tenantId: number, contratoId: number, itemId: number, input: { competencia: string; valorPrevisto: number }) {
    return updateContratoProgramacaoFinanceira(tenantId, contratoId, itemId, input)
  }
  async deleteFinancialScheduleItem(tenantId: number, contratoId: number, itemId: number) {
    return deleteContratoProgramacaoFinanceira(tenantId, contratoId, itemId)
  }

  // Aditivos
  async listAddenda(tenantId: number, contratoId: number) {
    return listContratoAditivos(tenantId, contratoId)
  }
  async createAddendum(tenantId: number, contratoId: number, input: unknown) {
    return createContratoAditivo(tenantId, contratoId, input as Parameters<typeof createContratoAditivo>[2])
  }
  async updateAddendum(tenantId: number, contratoId: number, aditivoId: number, input: unknown) {
    return updateContratoAditivo(tenantId, contratoId, aditivoId, input as Parameters<typeof updateContratoAditivo>[3])
  }
  async approveAddendum(tenantId: number, contratoId: number, aditivoId: number) {
    return aprovarContratoAditivo(tenantId, contratoId, aditivoId)
  }
  async cancelAddendum(tenantId: number, contratoId: number, aditivoId: number) {
    return cancelarContratoAditivo(tenantId, contratoId, aditivoId)
  }

  // Eventos e observações
  async listEvents(tenantId: number, contratoId: number, filter?: EventoFilter) {
    return listContratoEventos(tenantId, contratoId, filter)
  }
  async createObservation(tenantId: number, contratoId: number, input: unknown) {
    return createContratoObservacao(tenantId, contratoId, input as Parameters<typeof createContratoObservacao>[2])
  }
  async addEventAttachment(tenantId: number, contratoId: number, eventoId: number, input: unknown) {
    return addContratoEventoAnexo(tenantId, contratoId, eventoId, input as Parameters<typeof addContratoEventoAnexo>[3])
  }
  async downloadEventAttachment(tenantId: number, contratoId: number, eventoId: number, anexoId: number) {
    return downloadContratoEventoAnexo(tenantId, contratoId, eventoId, anexoId)
  }

  // Serviços e cronograma
  async listServices(tenantId: number, contratoId: number) {
    return listContratoServicos(tenantId, contratoId)
  }
  async createService(tenantId: number, contratoId: number, input: unknown) {
    return createContratoServico(tenantId, contratoId, input as Parameters<typeof createContratoServico>[2])
  }
  async getSchedule(tenantId: number, contratoId: number) {
    return getContratoCronograma(tenantId, contratoId)
  }
  async seedSchedule(tenantId: number, contratoId: number, input?: { duracaoDiasPadrao?: number | null }) {
    return seedCronogramaFromServicos(tenantId, contratoId, input)
  }
  async updateScheduleItem(tenantId: number, contratoId: number, itemId: number, input: { dataInicio: string; dataFim: string }) {
    return updateCronogramaItemDatas(tenantId, contratoId, itemId, input)
  }
  async createScheduleDependency(tenantId: number, contratoId: number, input: { origemItemId: number; destinoItemId: number; tipo?: string | null }) {
    return createScheduleDependency(tenantId, contratoId, input)
  }
  async deleteScheduleDependency(tenantId: number, contratoId: number, depId: number) {
    return deleteScheduleDependency(tenantId, contratoId, depId)
  }
}
