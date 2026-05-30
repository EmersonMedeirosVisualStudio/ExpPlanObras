import { Prisma } from '@prisma/client'
import prisma from '@/infra/database/prisma/client.js'
import type {
  CreateCasoComplianceInput,
  CreateEvidenciaInput,
  CreateExecucaoInput,
  CreateExecucaoPassoInput,
  CreateIncidenteTimelineInput,
  CreatePlaybookInput,
  IPlaybooksRepository,
  ListCasosComplianceFilter,
  ListExecucoesFilter,
  ListPlaybooksFilter,
  UpdateCasoComplianceInput,
  UpdateExecucaoInput,
  UpdatePlaybookInput,
} from '@/domain/repositories/IPlaybooksRepository.js'

export class PrismaPlaybooksRepository implements IPlaybooksRepository {
  // ─── Playbook ──────────────────────────────────────────────────────────────

  async listPlaybooks(tenantId: number, filter?: ListPlaybooksFilter) {
    const where: Record<string, unknown> = { tenantId }
    if (filter?.ativo !== undefined) where['ativo'] = filter.ativo
    const pagina = filter?.pagina ?? 1
    const limite = filter?.limite ?? 30
    const skip = (pagina - 1) * limite
    return prisma.observabilidadePlaybook.findMany({
      where,
      orderBy: [{ ordemPrioridade: 'asc' }, { id: 'desc' }],
      skip,
      take: limite,
    })
  }

  async countPlaybooks(tenantId: number, filter?: ListPlaybooksFilter) {
    const where: Record<string, unknown> = { tenantId }
    if (filter?.ativo !== undefined) where['ativo'] = filter.ativo
    return prisma.observabilidadePlaybook.count({ where })
  }

  async getPlaybookById(tenantId: number, id: number) {
    const pb = await prisma.observabilidadePlaybook
      .findUnique({ where: { id }, include: { passos: { orderBy: [{ ordemExecucao: 'asc' }] } } })
      .catch(() => null)
    if (!pb || pb.tenantId !== tenantId) return null
    return pb
  }

  async createPlaybook(tenantId: number, input: CreatePlaybookInput) {
    return prisma.$transaction(async (tx) => {
      const pb = await tx.observabilidadePlaybook.create({
        data: {
          tenantId,
          codigo: input.codigo,
          nome: input.nome,
          descricao: input.descricao ?? null,
          categoria: input.categoria ?? null,
          modoExecucao: input.modoExecucao,
          gatilhoTipo: input.gatilhoTipo,
          filtroEventoJson: (input.filtroEventoJson ?? Prisma.JsonNull) as Prisma.InputJsonValue,
          filtroAlertaJson: (input.filtroAlertaJson ?? Prisma.JsonNull) as Prisma.InputJsonValue,
          filtroIncidenteJson: (input.filtroIncidenteJson ?? Prisma.JsonNull) as Prisma.InputJsonValue,
          riscoPadrao: input.riscoPadrao,
          politicaAprovacao: input.politicaAprovacao,
          ativo: input.ativo,
          ordemPrioridade: input.ordemPrioridade,
        },
      })
      if (input.passos && input.passos.length > 0) {
        await tx.observabilidadePlaybookPasso.createMany({
          data: input.passos.map((p) => ({
            tenantId,
            playbookId: pb.id,
            ordemExecucao: p.ordemExecucao,
            tipoAcao: p.tipoAcao,
            nomePasso: p.nomePasso,
            descricao: p.descricao ?? null,
            configuracaoJson: (p.configuracaoJson ?? Prisma.JsonNull) as Prisma.InputJsonValue,
            timeoutSegundos: p.timeoutSegundos ?? null,
            continuaEmErro: p.continuaEmErro ?? false,
            reversivel: p.reversivel ?? false,
            acaoCompensacaoJson: (p.acaoCompensacaoJson ?? Prisma.JsonNull) as Prisma.InputJsonValue,
            riscoAcao: p.riscoAcao,
          })),
        })
      }
      return pb
    })
  }

  async updatePlaybook(tenantId: number, id: number, input: UpdatePlaybookInput) {
    return prisma.$transaction(async (tx) => {
      await tx.observabilidadePlaybook.update({
        where: { id },
        data: {
          nome: input.nome !== undefined ? input.nome : undefined,
          descricao: input.descricao !== undefined ? input.descricao : undefined,
          categoria: input.categoria !== undefined ? input.categoria : undefined,
          modoExecucao: input.modoExecucao !== undefined ? input.modoExecucao : undefined,
          gatilhoTipo: input.gatilhoTipo !== undefined ? input.gatilhoTipo : undefined,
          filtroEventoJson: input.filtroEventoJson !== undefined ? (input.filtroEventoJson ?? Prisma.JsonNull) as Prisma.InputJsonValue : undefined,
          filtroAlertaJson: input.filtroAlertaJson !== undefined ? (input.filtroAlertaJson ?? Prisma.JsonNull) as Prisma.InputJsonValue : undefined,
          filtroIncidenteJson: input.filtroIncidenteJson !== undefined ? (input.filtroIncidenteJson ?? Prisma.JsonNull) as Prisma.InputJsonValue : undefined,
          riscoPadrao: input.riscoPadrao !== undefined ? input.riscoPadrao : undefined,
          politicaAprovacao: input.politicaAprovacao !== undefined ? input.politicaAprovacao : undefined,
          ativo: input.ativo !== undefined ? input.ativo : undefined,
          ordemPrioridade: input.ordemPrioridade !== undefined ? input.ordemPrioridade : undefined,
        },
      })
      if (Array.isArray(input.passos)) {
        await tx.observabilidadePlaybookPasso.deleteMany({
          where: { tenantId, playbookId: id },
        })
        if (input.passos.length > 0) {
          await tx.observabilidadePlaybookPasso.createMany({
            data: input.passos.map((p) => ({
              tenantId,
              playbookId: id,
              ordemExecucao: p.ordemExecucao,
              tipoAcao: p.tipoAcao,
              nomePasso: p.nomePasso,
              descricao: p.descricao ?? null,
              configuracaoJson: (p.configuracaoJson ?? Prisma.JsonNull) as Prisma.InputJsonValue,
              timeoutSegundos: p.timeoutSegundos ?? null,
              continuaEmErro: p.continuaEmErro ?? false,
              reversivel: p.reversivel ?? false,
              acaoCompensacaoJson: (p.acaoCompensacaoJson ?? Prisma.JsonNull) as Prisma.InputJsonValue,
              riscoAcao: p.riscoAcao,
            })),
          })
        }
      }
    })
  }

  async getPlaybookWithSteps(tenantId: number, id: number) {
    const pb = await prisma.observabilidadePlaybook
      .findUnique({
        where: { id },
        include: { passos: { orderBy: [{ ordemExecucao: 'asc' }] } },
      })
      .catch(() => null)
    if (!pb || pb.tenantId !== tenantId) return null
    return pb
  }

  // ─── Execução ──────────────────────────────────────────────────────────────

  async listExecucoes(tenantId: number, filter?: ListExecucoesFilter) {
    const where: Record<string, unknown> = { tenantId }
    if (filter?.status) where['statusExecucao'] = filter.status.toUpperCase()
    const pagina = filter?.pagina ?? 1
    const limite = filter?.limite ?? 30
    const skip = (pagina - 1) * limite
    return prisma.observabilidadePlaybookExecucao.findMany({
      where,
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      skip,
      take: limite,
    })
  }

  async countExecucoes(tenantId: number, filter?: ListExecucoesFilter) {
    const where: Record<string, unknown> = { tenantId }
    if (filter?.status) where['statusExecucao'] = filter.status.toUpperCase()
    return prisma.observabilidadePlaybookExecucao.count({ where })
  }

  async getExecucaoById(tenantId: number, id: number) {
    const ex = await prisma.observabilidadePlaybookExecucao
      .findUnique({ where: { id } })
      .catch(() => null)
    if (!ex || ex.tenantId !== tenantId) return null
    return ex
  }

  async getExecucaoWithPlaybook(tenantId: number, id: number) {
    const ex = await prisma.observabilidadePlaybookExecucao
      .findUnique({
        where: { id },
        include: { playbook: { include: { passos: { orderBy: [{ ordemExecucao: 'asc' }] } } } },
      })
      .catch(() => null)
    if (!ex || ex.tenantId !== tenantId) return null
    return ex
  }

  async findExecucaoByIdempotencyKey(tenantId: number, chaveIdempotencia: string) {
    return prisma.observabilidadePlaybookExecucao
      .findUnique({ where: { tenantId_chaveIdempotencia: { tenantId, chaveIdempotencia } } })
      .catch(() => null)
  }

  async createExecucao(tenantId: number, input: CreateExecucaoInput) {
    return prisma.observabilidadePlaybookExecucao.create({
      data: {
        tenantId,
        playbookId: input.playbookId,
        alertaId: input.alertaId ?? null,
        incidenteId: input.incidenteId ?? null,
        eventoOrigemId: input.eventoOrigemId ?? null,
        modoExecucao: input.modoExecucao,
        statusExecucao: input.statusExecucao,
        chaveIdempotencia: input.chaveIdempotencia,
        aprovacaoExigida: input.aprovacaoExigida,
        executadoPorUserId: input.executadoPorUserId,
        iniciadoEm: input.iniciadoEm ?? null,
      } as Parameters<typeof prisma.observabilidadePlaybookExecucao.create>[0]['data'],
    })
  }

  async updateExecucao(tenantId: number, id: number, input: UpdateExecucaoInput) {
    return prisma.observabilidadePlaybookExecucao.update({
      where: { id },
      data: {
        statusExecucao: input.statusExecucao,
        aprovadoPorUserId: input.aprovadoPorUserId,
        aprovadoEm: input.aprovadoEm,
        iniciadoEm: input.iniciadoEm,
        finalizadoEm: input.finalizadoEm,
        resultadoResumoJson: input.resultadoResumoJson,
      } as Parameters<typeof prisma.observabilidadePlaybookExecucao.update>[0]['data'],
    })
  }

  // ─── Execução Passo ────────────────────────────────────────────────────────

  async createExecucaoPasso(tenantId: number, input: CreateExecucaoPassoInput) {
    return prisma.observabilidadePlaybookExecucaoPasso.create({
      data: {
        tenantId,
        execucaoId: input.execucaoId,
        passoId: input.passoId,
        ordemExecucao: input.ordemExecucao,
        statusPasso: input.statusPasso,
        iniciadoEm: input.iniciadoEm ?? null,
        entradaRedactedJson: input.entradaRedactedJson ?? null,
      } as Parameters<typeof prisma.observabilidadePlaybookExecucaoPasso.create>[0]['data'],
    })
  }

  async updateExecucaoPasso(tenantId: number, id: number, input: Partial<CreateExecucaoPassoInput>) {
    return prisma.observabilidadePlaybookExecucaoPasso.update({
      where: { id },
      data: {
        statusPasso: input.statusPasso,
        finalizadoEm: input.finalizadoEm,
        saidaRedactedJson: input.saidaRedactedJson,
        erroResumo: input.erroResumo,
      } as Parameters<typeof prisma.observabilidadePlaybookExecucaoPasso.update>[0]['data'],
    })
  }

  // ─── Incidente ─────────────────────────────────────────────────────────────

  async getIncidenteById(tenantId: number, id: number) {
    const inc = await prisma.observabilidadeIncidente
      .findUnique({ where: { id } })
      .catch(() => null)
    if (!inc || inc.tenantId !== tenantId) return null
    return inc
  }

  // ─── Incidente Timeline ────────────────────────────────────────────────────

  async listIncidenteTimeline(tenantId: number, incidenteId: number) {
    return prisma.observabilidadeIncidenteTimeline.findMany({
      where: { tenantId, incidenteId },
      orderBy: [{ criadoEm: 'asc' }],
    })
  }

  async createIncidenteTimeline(tenantId: number, input: CreateIncidenteTimelineInput) {
    return prisma.observabilidadeIncidenteTimeline.create({
      data: {
        tenantId,
        incidenteId: input.incidenteId,
        tipoEventoTimeline: input.tipoEventoTimeline,
        titulo: input.titulo,
        descricao: input.descricao ?? null,
        autorUserId: input.autorUserId,
        metadataJson: (input.metadataJson ?? Prisma.JsonNull) as Prisma.InputJsonValue,
      },
    })
  }

  // ─── Caso Compliance ───────────────────────────────────────────────────────

  async listCasosCompliance(tenantId: number, filter?: ListCasosComplianceFilter) {
    const where: Record<string, unknown> = { tenantId }
    if (filter?.status) where['statusCaso'] = filter.status.toUpperCase()
    const pagina = filter?.pagina ?? 1
    const limite = filter?.limite ?? 30
    const skip = (pagina - 1) * limite
    return prisma.observabilidadeCasoCompliance.findMany({
      where,
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      skip,
      take: limite,
    })
  }

  async countCasosCompliance(tenantId: number, filter?: ListCasosComplianceFilter) {
    const where: Record<string, unknown> = { tenantId }
    if (filter?.status) where['statusCaso'] = filter.status.toUpperCase()
    return prisma.observabilidadeCasoCompliance.count({ where })
  }

  async getCasoComplianceById(tenantId: number, id: number) {
    const row = await prisma.observabilidadeCasoCompliance
      .findUnique({ where: { id }, include: { evidencias: true } })
      .catch(() => null)
    if (!row || row.tenantId !== tenantId) return null
    return row
  }

  async createCasoCompliance(tenantId: number, input: CreateCasoComplianceInput) {
    return prisma.observabilidadeCasoCompliance.create({
      data: {
        tenantId,
        incidenteId: input.incidenteId ?? null,
        tipoCaso: input.tipoCaso,
        statusCaso: input.statusCaso ?? 'ABERTO',
        criticidade: input.criticidade,
        ownerUserId: input.ownerUserId ?? null,
        prazoRespostaEm: input.prazoRespostaEm ?? null,
        prazoConclusaoEm: input.prazoConclusaoEm ?? null,
      } as Parameters<typeof prisma.observabilidadeCasoCompliance.create>[0]['data'],
    })
  }

  async updateCasoCompliance(tenantId: number, id: number, input: UpdateCasoComplianceInput) {
    return prisma.observabilidadeCasoCompliance.update({
      where: { id },
      data: {
        statusCaso: input.statusCaso,
        parecerFinal: input.parecerFinal,
      } as Parameters<typeof prisma.observabilidadeCasoCompliance.update>[0]['data'],
    })
  }

  // ─── Evidência ─────────────────────────────────────────────────────────────

  async createEvidencia(tenantId: number, input: CreateEvidenciaInput) {
    return prisma.observabilidadeCasoComplianceEvidencia.create({
      data: {
        tenantId,
        casoId: input.casoId,
        tipoEvidencia: input.tipoEvidencia,
        referenciaTipo: input.referenciaTipo ?? null,
        referenciaId: input.referenciaId ?? null,
        descricao: input.descricao ?? null,
        arquivoPath: input.arquivoPath ?? null,
        hashSha256: input.hashSha256 ?? null,
        metadataJson: (input.metadataJson ?? Prisma.JsonNull) as Prisma.InputJsonValue,
      } as Parameters<typeof prisma.observabilidadeCasoComplianceEvidencia.create>[0]['data'],
    })
  }

  // ─── TenantUser ────────────────────────────────────────────────────────────

  async getTenantUserRole(tenantId: number, userId: number) {
    const tu = await prisma.tenantUser
      .findUnique({
        where: { tenantId_userId: { tenantId, userId } },
        select: { role: true },
      })
      .catch(() => null)
    return tu?.role ?? null
  }
}
