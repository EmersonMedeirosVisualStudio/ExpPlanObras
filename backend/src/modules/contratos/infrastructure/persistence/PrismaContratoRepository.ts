import type { DashboardFilter, EventoFilter, FaturamentoFilter, IContratoRepository, ListContratosFilter } from '@/modules/contratos/domain/ports/IContratoRepository.js'
import {
  addContratoEventoAnexo,
  aprovarContratoAditivo,
  cancelarContratoAditivo,
  createContrato,
  createContratoAditivo,
  createCronogramaDependencia,
  createContratoMedicao,
  createContratoObservacao,
  createContratoPagamento,
  createContratoProgramacaoFinanceira,
  createContratoServico,
  createSubcontrato,
  deleteCronogramaDependencia,
  deleteContratoPagamento,
  deleteContratoProgramacaoFinanceira,
  deleteSubcontrato,
  downloadContratoEventoAnexo,
  ensureContratoPendente,
  getContratoById,
  getContratoConsolidado,
  getContratoCronograma,
  getContratosDashboard,
  getContratosFaturamento,
  getSubcontratosResumo,
  listContratoAditivos,
  listContratoEventos,
  listContratoMedicoes,
  listContratoPagamentos,
  listContratoProgramacaoFinanceira,
  listContratos,
  listContratoServicos,
  listSubcontratos,
  seedCronogramaFromServicos,
  updateContrato,
  updateContratoAditivo,
  updateContratoMedicaoStatus,
  updateContratoProgramacaoFinanceira,
  updateCronogramaItemDatas,
  updateSubcontrato,
} from '@/modules/contratos/contratos.service.js'

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
  async getFaturamento(tenantId: number, filter: FaturamentoFilter) {
    return getContratosFaturamento(tenantId, filter)
  }
  async getConsolidado(tenantId: number, id: number) {
    return getContratoConsolidado(tenantId, id)
  }
  async ensurePendente(tenantId: number) {
    return ensureContratoPendente(tenantId)
  }

  // Subcontratos
  async getSubcontratosResumo(tenantId: number, contratoId: number) {
    return getSubcontratosResumo(tenantId, contratoId)
  }
  async listSubcontratos(tenantId: number, contratoId: number) {
    return listSubcontratos(tenantId, contratoId)
  }
  async createSubcontrato(tenantId: number, contratoId: number, input: unknown) {
    return createSubcontrato(tenantId, contratoId, input as Parameters<typeof createSubcontrato>[2])
  }
  async updateSubcontrato(tenantId: number, contratoId: number, subId: number, input: unknown) {
    return updateSubcontrato(tenantId, contratoId, subId, input as Parameters<typeof updateSubcontrato>[3])
  }
  async deleteSubcontrato(tenantId: number, contratoId: number, subId: number) {
    return deleteSubcontrato(tenantId, contratoId, subId)
  }

  // Medições
  async listMedicoes(tenantId: number, contratoId: number) {
    return listContratoMedicoes(tenantId, contratoId)
  }
  async createMedicao(tenantId: number, contratoId: number, input: { date: string; amount: number; status?: string | null }) {
    return createContratoMedicao(tenantId, contratoId, input)
  }
  async updateMedicaoStatus(tenantId: number, contratoId: number, medicaoId: number, input: { status: string }) {
    return updateContratoMedicaoStatus(tenantId, contratoId, medicaoId, input)
  }

  // Pagamentos
  async listPagamentos(tenantId: number, contratoId: number) {
    return listContratoPagamentos(tenantId, contratoId)
  }
  async createPagamento(tenantId: number, contratoId: number, input: { date: string; amount: number; medicaoId?: number | null }) {
    return createContratoPagamento(tenantId, contratoId, input)
  }
  async deletePagamento(tenantId: number, contratoId: number, pagamentoId: number) {
    return deleteContratoPagamento(tenantId, contratoId, pagamentoId)
  }

  // Programação financeira
  async listProgramacaoFinanceira(tenantId: number, contratoId: number) {
    return listContratoProgramacaoFinanceira(tenantId, contratoId)
  }
  async createProgramacaoFinanceira(tenantId: number, contratoId: number, input: { competencia: string; valorPrevisto: number }) {
    return createContratoProgramacaoFinanceira(tenantId, contratoId, input)
  }
  async updateProgramacaoFinanceira(tenantId: number, contratoId: number, itemId: number, input: { competencia: string; valorPrevisto: number }) {
    return updateContratoProgramacaoFinanceira(tenantId, contratoId, itemId, input)
  }
  async deleteProgramacaoFinanceira(tenantId: number, contratoId: number, itemId: number) {
    return deleteContratoProgramacaoFinanceira(tenantId, contratoId, itemId)
  }

  // Aditivos
  async listAditivos(tenantId: number, contratoId: number) {
    return listContratoAditivos(tenantId, contratoId)
  }
  async createAditivo(tenantId: number, contratoId: number, input: unknown) {
    return createContratoAditivo(tenantId, contratoId, input as Parameters<typeof createContratoAditivo>[2])
  }
  async updateAditivo(tenantId: number, contratoId: number, aditivoId: number, input: unknown) {
    return updateContratoAditivo(tenantId, contratoId, aditivoId, input as Parameters<typeof updateContratoAditivo>[3])
  }
  async aprovarAditivo(tenantId: number, contratoId: number, aditivoId: number) {
    return aprovarContratoAditivo(tenantId, contratoId, aditivoId)
  }
  async cancelarAditivo(tenantId: number, contratoId: number, aditivoId: number) {
    return cancelarContratoAditivo(tenantId, contratoId, aditivoId)
  }

  // Eventos e observações
  async listEventos(tenantId: number, contratoId: number, filter?: EventoFilter) {
    return listContratoEventos(tenantId, contratoId, filter)
  }
  async createObservacao(tenantId: number, contratoId: number, input: unknown) {
    return createContratoObservacao(tenantId, contratoId, input as Parameters<typeof createContratoObservacao>[2])
  }
  async addEventoAnexo(tenantId: number, contratoId: number, eventoId: number, input: unknown) {
    return addContratoEventoAnexo(tenantId, contratoId, eventoId, input as Parameters<typeof addContratoEventoAnexo>[3])
  }
  async downloadEventoAnexo(tenantId: number, contratoId: number, eventoId: number, anexoId: number) {
    return downloadContratoEventoAnexo(tenantId, contratoId, eventoId, anexoId)
  }

  // Serviços e cronograma
  async listServicos(tenantId: number, contratoId: number) {
    return listContratoServicos(tenantId, contratoId)
  }
  async createServico(tenantId: number, contratoId: number, input: unknown) {
    return createContratoServico(tenantId, contratoId, input as Parameters<typeof createContratoServico>[2])
  }
  async getCronograma(tenantId: number, contratoId: number) {
    return getContratoCronograma(tenantId, contratoId)
  }
  async seedCronograma(tenantId: number, contratoId: number, input?: { duracaoDiasPadrao?: number | null }) {
    return seedCronogramaFromServicos(tenantId, contratoId, input)
  }
  async updateCronogramaItem(tenantId: number, contratoId: number, itemId: number, input: { dataInicio: string; dataFim: string }) {
    return updateCronogramaItemDatas(tenantId, contratoId, itemId, input)
  }
  async createCronogramaDependencia(tenantId: number, contratoId: number, input: { origemItemId: number; destinoItemId: number; tipo?: string | null }) {
    return createCronogramaDependencia(tenantId, contratoId, input)
  }
  async deleteCronogramaDependencia(tenantId: number, contratoId: number, depId: number) {
    return deleteCronogramaDependencia(tenantId, contratoId, depId)
  }
}
