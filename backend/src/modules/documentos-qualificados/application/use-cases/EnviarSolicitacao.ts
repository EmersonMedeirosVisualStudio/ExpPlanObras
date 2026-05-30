import type { IDocumentosQualificadosRepository } from '@/modules/documentos-qualificados/domain/ports/IDocumentosQualificadosRepository.js'
import {
  SolicitacaoNotFoundError,
  SolicitacaoInvalidStatusError,
  SolicitacaoMissingCallbackTokenError,
  ProviderNotSupportedError,
  DocumentDownloadError,
  PublicApiUrlNotConfiguredError,
} from '@/modules/documentos-qualificados/domain/errors/DocumentosQualificadosErrors.js'
import { getQualifiedSignatureProvider } from '@/modules/documentos-qualificados/providers/registry.js'

export interface EnviarSolicitacaoResult {
  id: number
  envelopeId: string
  signingUrl: string | null
}

export class EnviarSolicitacaoUseCase {
  constructor(private readonly repo: IDocumentosQualificadosRepository) {}

  async execute(tenantId: number, id: number): Promise<EnviarSolicitacaoResult> {
    const s = await this.repo.findSolicitacaoForSend(tenantId, id)
    if (!s) throw new SolicitacaoNotFoundError(id)

    if (s.statusSolicitacao !== 'RASCUNHO' && s.statusSolicitacao !== 'ERRO') {
      throw new SolicitacaoInvalidStatusError(s.statusSolicitacao)
    }
    if (!s.callbackToken) throw new SolicitacaoMissingCallbackTokenError()

    const provedor = s.provedor
    const providerImpl = getQualifiedSignatureProvider(provedor.codigo)
    if (!providerImpl) throw new ProviderNotSupportedError(provedor.codigo)

    const versao = s.versao
    if (!versao) throw new SolicitacaoNotFoundError(id)

    const url = versao.urlOriginal
    const fileName = `documento-${s.documentoId}-v${versao.numeroVersao}.pdf`
    const docRes = await fetch(url).catch(() => null)
    if (!docRes || !docRes.ok) throw new DocumentDownloadError()
    const arrayBuf = await docRes.arrayBuffer()
    const buffer = Buffer.from(arrayBuf)

    const baseUrl = String(process.env.PUBLIC_API_URL || '').replace(/\/$/, '')
    const callbackUrl = `${baseUrl}/api/v1/documentos/qualificados/callback/${encodeURIComponent(provedor.codigo)}`
    if (!callbackUrl.startsWith('http')) throw new PublicApiUrlNotConfiguredError()

    const signatarios = s.signatarios ?? []
    const created = await providerImpl.createEnvelope({
      tenantId: s.tenantId,
      requestId: s.id,
      callbackUrl,
      callbackToken: s.callbackToken,
      document: { fileName, mimeType: 'application/pdf', buffer },
      signers: signatarios.map((p) => ({
        name: p.nomeSignatario,
        email: p.emailSignatario,
        document: p.documentoSignatario,
        role: p.papelSignatario,
      })),
      config: (provedor.configuracaoJson as Record<string, unknown>) || null,
    })

    const updated = await this.repo.updateSolicitacaoAfterSend(tenantId, s.id, {
      providerEnvelopeId: created.envelopeId,
      providerDocumentId: created.documentId ?? null,
      linkAssinaturaExterno: created.signingUrl ?? null,
      providerStatus: 'ENVIADA',
      statusSolicitacao: 'AGUARDANDO_ASSINATURA',
      enviadoEm: new Date(),
      motivoErro: null,
    })

    return {
      id: updated.id,
      envelopeId: created.envelopeId,
      signingUrl: created.signingUrl ?? null,
    }
  }
}
