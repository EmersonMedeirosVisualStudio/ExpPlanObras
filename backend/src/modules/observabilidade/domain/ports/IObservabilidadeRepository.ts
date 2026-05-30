export interface CreateEventoInput {
  tenantId: number
  eventId: string
  categoria: string
  subcategoria: string | null
  nomeEvento: string
  severidade: string
  resultado: string
  origemTipo: string
  origemChave: string | null
  modulo: string | null
  entidadeTipo: string | null
  entidadeId: number | null
  actorTipo: string | null
  actorUserId: number | null
  actorEmail: string | null
  targetTipo: string | null
  targetId: number | null
  requestId: string | null
  correlationId: string | null
  sessionId: string | null
  traceId: string | null
  ip: string | null
  userAgent: string | null
  rota: string | null
  metodoHttp: string | null
  statusHttp: number | null
  payloadRedactedJson: unknown
  labelsJson: Record<string, string> | null
  ocorridoEm: Date
}

export interface ListEventosFilter {
  pagina: number
  limite: number
  categoria?: string
  severidade?: string
  resultado?: string
  origemTipo?: string
  texto?: string
  desde?: string
  ate?: string
}

export interface ListAlertasFilter {
  pagina: number
  limite: number
  status?: string
}

export interface ListIncidentesFilter {
  pagina: number
  limite: number
  status?: string
}

export interface ListRegrasFilter {
  pagina: number
  limite: number
  ativo?: string
}

export interface PaginatedResult<T> {
  rows: T[]
  total: number
}

export interface IObservabilidadeRepository {
  createEvento(input: CreateEventoInput): Promise<{ id: number; eventId: string }>
  listEventos(tenantId: number, filter: ListEventosFilter): Promise<PaginatedResult<unknown>>
  getEventoById(tenantId: number, id: number): Promise<unknown | null>
  listAlertas(tenantId: number, filter: ListAlertasFilter): Promise<PaginatedResult<unknown>>
  listIncidentes(tenantId: number, filter: ListIncidentesFilter): Promise<PaginatedResult<unknown>>
  getIncidenteById(tenantId: number, id: number): Promise<unknown | null>
  listRegras(tenantId: number, filter: ListRegrasFilter): Promise<PaginatedResult<unknown>>
}
