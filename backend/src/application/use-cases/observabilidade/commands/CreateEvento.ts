import { normalizeEvent } from '@/infra/providers/observabilidade/normalize.js'
import { redactPayload } from '@/infra/providers/observabilidade/redaction.js'
import type { IObservabilidadeRepository } from '@/domain/repositories/IObservabilidadeRepository.js'

export interface CreateEventoInput {
  tenantId: number
  categoria: string
  subcategoria?: string | null
  nomeEvento: string
  severidade?: string
  resultado?: string
  origemTipo?: string
  origemChave?: string | null
  modulo?: string | null
  entidadeTipo?: string | null
  entidadeId?: number | null
  actorTipo?: string | null
  actorUserId?: number | null
  actorEmail?: string | null
  targetTipo?: string | null
  targetId?: number | null
  requestId?: string | null
  correlationId?: string | null
  sessionId?: string | null
  traceId?: string | null
  ip?: string | null
  userAgent?: string | null
  rota?: string | null
  metodoHttp?: string | null
  statusHttp?: number | null
  payload?: unknown
  labelsJson?: Record<string, string> | null
  ocorridoEm?: string
}

export class CreateEventoUseCase {
  constructor(private readonly repo: IObservabilidadeRepository) {}

  async execute(input: CreateEventoInput): Promise<{ id: number; eventId: string }> {
    const norm = normalizeEvent(input)
    const redacted = input.payload ? redactPayload(input.payload) : null
    return this.repo.createEvento({
      tenantId: input.tenantId,
      ...norm,
      payloadRedactedJson: redacted,
    })
  }
}
