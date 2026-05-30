import type { IDocumentosQualificadosRepository } from '@/domain/repositories/IDocumentosQualificadosRepository.js'
import {
  SolicitacaoNotFoundError,
  ArtefatoNotFoundError,
} from '@/domain/errors/DocumentosQualificadosErrors.js'
import { getQualifiedSignatureProvider } from '@/infra/providers/documentos-qualificados/providers/registry.js'

export interface VerificarAssinaturaResult {
  valido: boolean | null
  status: string
}

export class VerificarAssinaturaUseCase {
  constructor(private readonly repo: IDocumentosQualificadosRepository) {}

  async execute(tenantId: number, solicitacaoId: number): Promise<VerificarAssinaturaResult> {
    const s = await this.repo.findSolicitacaoById(tenantId, solicitacaoId)
    if (!s) throw new SolicitacaoNotFoundError(solicitacaoId)

    const art = await this.repo.findFirstSignedArtefato(tenantId, solicitacaoId)
    if (!art || !art.data) throw new ArtefatoNotFoundError()

    const provedor = s.provedor
    const providerImpl = getQualifiedSignatureProvider(provedor.codigo)
    let valid: boolean | null = null

    try {
      if (providerImpl?.verifyDocument) {
        const res = await providerImpl.verifyDocument({
          tenantId,
          buffer: Buffer.from(art.data),
          config: (provedor.configuracaoJson as Record<string, unknown>) || null,
        })
        valid = Boolean(res.valid)
      }
    } catch {
      valid = null
    }

    const status = valid === true ? 'VALIDA' : valid === false ? 'INVALIDA' : 'NAO_VERIFICADA'

    await this.repo.updateVersaoVerificacao(tenantId, s.versaoId, {
      verificacaoAssinaturaStatus: status,
      verificacaoAssinaturaEm: new Date(),
    })

    return { valido: valid, status }
  }
}
