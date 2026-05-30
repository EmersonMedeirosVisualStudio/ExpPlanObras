import crypto from 'node:crypto'
import {
  ProviderNotSupportedError,
  SolicitacaoMissingEnvelopeIdError,
  SolicitacaoNotFoundError,
} from '@/domain/errors/DocumentosQualificadosErrors.js'
import type { IDocumentosQualificadosRepository } from '@/domain/repositories/IDocumentosQualificadosRepository.js'
import { getQualifiedSignatureProvider } from '@/infra/providers/documentos-qualificados/providers/registry.js'

function sha256Hex(buf: Buffer): string {
  return crypto.createHash('sha256').update(buf).digest('hex')
}

function mapProviderStatusToLocal(status: string): string {
  const s = String(status || '').toUpperCase()
  if (['SIGNED', 'ASSINADA', 'COMPLETED', 'CONCLUIDA', 'DONE'].includes(s)) return 'ASSINADA'
  if (['REJECTED', 'REJEITADA'].includes(s)) return 'REJEITADA'
  if (['CANCELED', 'CANCELADA'].includes(s)) return 'CANCELADA'
  if (['EXPIRED', 'EXPIRADA'].includes(s)) return 'EXPIRADA'
  if (['ERROR', 'ERRO', 'FAILED', 'FALHOU'].includes(s)) return 'ERRO'
  if (['PARTIAL', 'PARCIAL'].includes(s)) return 'PARCIAL'
  return 'AGUARDANDO_ASSINATURA'
}

export interface SincronizarSolicitacaoResult {
  id: number
  statusSolicitacao: string
  concluded: boolean
  signedArtifactId: number | null
}

export class SincronizarSolicitacaoUseCase {
  constructor(private readonly repo: IDocumentosQualificadosRepository) {}

  async execute(tenantId: number, id: number): Promise<SincronizarSolicitacaoResult> {
    const s = await this.repo.findSolicitacaoForSync(tenantId, id)
    if (!s) throw new SolicitacaoNotFoundError(id)
    if (!s.providerEnvelopeId) throw new SolicitacaoMissingEnvelopeIdError()

    const provedor = s.provedor
    const providerImpl = getQualifiedSignatureProvider(provedor.codigo)
    if (!providerImpl) throw new ProviderNotSupportedError(provedor.codigo)

    const status = await providerImpl.getEnvelopeStatus({
      tenantId: s.tenantId,
      envelopeId: s.providerEnvelopeId,
      config: (provedor.configuracaoJson as Record<string, unknown>) || null,
    })
    const localStatus = mapProviderStatusToLocal(status.status)

    const versao = s.versao
    if (!versao) throw new SolicitacaoNotFoundError(id)

    type SignedArtifact = Parameters<IDocumentosQualificadosRepository['syncSolicitacao']>[3]
    type VersaoUpdate = Parameters<IDocumentosQualificadosRepository['syncSolicitacao']>[5]

    let signedArtifact: SignedArtifact = null
    let versaoUpdate: VersaoUpdate = null

    if (localStatus === 'ASSINADA') {
      const dl = await providerImpl.downloadSignedDocument({
        tenantId: s.tenantId,
        envelopeId: s.providerEnvelopeId,
        config: (provedor.configuracaoJson as Record<string, unknown>) || null,
      })
      const hash = sha256Hex(dl.buffer)
      const signedBytes = Uint8Array.from(dl.buffer) as Uint8Array<ArrayBuffer>

      signedArtifact = {
        tenantId: s.tenantId,
        solicitacaoId: s.id,
        tipoArtefato: 'PDF_ASSINADO',
        nomeArquivo: dl.fileName,
        mimeType: dl.mimeType,
        tamanhoBytes: dl.buffer.length,
        hashSha256: hash,
        data: signedBytes,
      }

      versaoUpdate = {
        urlAssinado: null,
        hashSha256Assinado: hash,
        tipoAssinaturaFinal: s.tipoAssinatura,
        assinaturaQualificadaConcluida: true,
        verificacaoAssinaturaStatus: 'NAO_VERIFICADA',
        verificacaoAssinaturaEm: null,
      }
    }

    const result = await this.repo.syncSolicitacao(
      tenantId,
      id,
      {
        providerStatus: String(status.status || ''),
        statusSolicitacao: localStatus,
        motivoErro: null,
        concluidoEm: localStatus === 'ASSINADA' ? new Date() : s.concluidoEm,
      },
      signedArtifact,
      versao.id,
      versaoUpdate,
      s.tipoAssinatura,
    )

    return {
      id: result.solicitacao.id,
      statusSolicitacao: result.solicitacao.statusSolicitacao,
      concluded: result.concluded,
      signedArtifactId: result.signedArtifactId,
    }
  }
}
