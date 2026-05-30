import prisma from '@/infra/database/prisma/client.js'
import type {
  CreateEventoInput,
  IObservabilidadeRepository,
  ListAlertasFilter,
  ListEventosFilter,
  ListIncidentesFilter,
  ListRegrasFilter,
  PaginatedResult,
} from '@/domain/repositories/IObservabilidadeRepository.js'

export class PrismaObservabilidadeRepository implements IObservabilidadeRepository {
  async createEvento(input: CreateEventoInput): Promise<{ id: number; eventId: string }> {
    const created = await prisma.observabilidadeEvento.create({
      data: {
        tenantId: input.tenantId,
        eventId: input.eventId,
        categoria: input.categoria,
        subcategoria: input.subcategoria,
        nomeEvento: input.nomeEvento,
        severidade: input.severidade,
        resultado: input.resultado,
        origemTipo: input.origemTipo,
        origemChave: input.origemChave,
        modulo: input.modulo,
        entidadeTipo: input.entidadeTipo,
        entidadeId: input.entidadeId,
        actorTipo: input.actorTipo,
        actorUserId: input.actorUserId,
        actorEmail: input.actorEmail,
        targetTipo: input.targetTipo,
        targetId: input.targetId,
        requestId: input.requestId,
        correlationId: input.correlationId,
        sessionId: input.sessionId,
        traceId: input.traceId,
        ip: input.ip,
        userAgent: input.userAgent,
        rota: input.rota,
        metodoHttp: input.metodoHttp,
        statusHttp: input.statusHttp,
        payloadRedactedJson: input.payloadRedactedJson ?? undefined,
        labelsJson: input.labelsJson ?? undefined,
        ocorridoEm: input.ocorridoEm,
      },
    })
    return { id: created.id, eventId: created.eventId }
  }

  async listEventos(tenantId: number, filter: ListEventosFilter): Promise<PaginatedResult<unknown>> {
    const where: Record<string, unknown> = { tenantId }
    if (filter.categoria) where.categoria = String(filter.categoria).toUpperCase()
    if (filter.severidade) where.severidade = String(filter.severidade).toUpperCase()
    if (filter.resultado) where.resultado = String(filter.resultado).toUpperCase()
    if (filter.origemTipo) where.origemTipo = String(filter.origemTipo).toUpperCase()

    if (filter.texto) {
      const t = String(filter.texto)
      where.OR = [
        { nomeEvento: { contains: t, mode: 'insensitive' } },
        { rota: { contains: t, mode: 'insensitive' } },
        { actorEmail: { contains: t, mode: 'insensitive' } },
      ]
    }

    if (filter.desde || filter.ate) {
      const ocorridoEm: Record<string, unknown> = {}
      if (filter.desde) ocorridoEm.gte = new Date(filter.desde)
      if (filter.ate) ocorridoEm.lte = new Date(filter.ate)
      where.ocorridoEm = ocorridoEm
    }

    const skip = (filter.pagina - 1) * filter.limite
    const [rows, total] = await Promise.all([
      prisma.observabilidadeEvento.findMany({
        where,
        orderBy: [{ ocorridoEm: 'desc' }, { id: 'desc' }],
        skip,
        take: filter.limite,
      }),
      prisma.observabilidadeEvento.count({ where }),
    ])
    return { rows, total }
  }

  async getEventoById(tenantId: number, id: number): Promise<unknown | null> {
    const ev = await prisma.observabilidadeEvento.findUnique({ where: { id } }).catch(() => null)
    if (!ev || ev.tenantId !== tenantId) return null
    return ev
  }

  async listAlertas(tenantId: number, filter: ListAlertasFilter): Promise<PaginatedResult<unknown>> {
    const where: Record<string, unknown> = { tenantId }
    if (filter.status) where.statusAlerta = String(filter.status).toUpperCase()

    const skip = (filter.pagina - 1) * filter.limite
    const [rows, total] = await Promise.all([
      prisma.observabilidadeAlerta.findMany({
        where,
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        skip,
        take: filter.limite,
      }),
      prisma.observabilidadeAlerta.count({ where }),
    ])
    return { rows, total }
  }

  async listIncidentes(tenantId: number, filter: ListIncidentesFilter): Promise<PaginatedResult<unknown>> {
    const where: Record<string, unknown> = { tenantId }
    if (filter.status) where.statusIncidente = String(filter.status).toUpperCase()

    const skip = (filter.pagina - 1) * filter.limite
    const [rows, total] = await Promise.all([
      prisma.observabilidadeIncidente.findMany({
        where,
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        skip,
        take: filter.limite,
      }),
      prisma.observabilidadeIncidente.count({ where }),
    ])
    return { rows, total }
  }

  async getIncidenteById(tenantId: number, id: number): Promise<unknown | null> {
    const inc = await prisma.observabilidadeIncidente.findUnique({ where: { id } }).catch(() => null)
    if (!inc || inc.tenantId !== tenantId) return null
    return inc
  }

  async listRegras(tenantId: number, filter: ListRegrasFilter): Promise<PaginatedResult<unknown>> {
    const where: Record<string, unknown> = { tenantId }
    if (filter.ativo !== undefined) where.ativo = String(filter.ativo).toLowerCase() === 'true'

    const skip = (filter.pagina - 1) * filter.limite
    const [rows, total] = await Promise.all([
      prisma.observabilidadeRegra.findMany({
        where,
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        skip,
        take: filter.limite,
      }),
      prisma.observabilidadeRegra.count({ where }),
    ])
    return { rows, total }
  }
}
