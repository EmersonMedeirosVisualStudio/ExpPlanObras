import type { IDocumentosQualificadosRepository } from '@/domain/repositories/IDocumentosQualificadosRepository.js'

export interface CreateCallbackInput {
  providerCode: string
  token: string
  payload: unknown
  requestId: string | null
}

export interface CreateCallbackResult {
  ok: boolean
}

export class CreateCallbackUseCase {
  constructor(private readonly repo: IDocumentosQualificadosRepository) {}

  async execute(input: CreateCallbackInput): Promise<CreateCallbackResult> {
    const provedor = await this.repo.findProvedorByCode(input.providerCode.trim().toUpperCase())
    if (!provedor) return { ok: false }

    const solicitacao = input.token
      ? await this.repo.findSolicitacaoByCallbackToken(provedor.tenantId, provedor.id, input.token)
      : null

    await this.repo.createCallback({
      tenantId: provedor.tenantId,
      solicitacaoId: solicitacao?.id ?? null,
      provedorId: provedor.id,
      providerEvento: 'WEBHOOK',
      providerRequestId: input.requestId || null,
      payloadJson: input.payload ?? {},
      statusProcessamento: 'PENDENTE',
    })

    return { ok: true }
  }
}
