import type { IDocumentosQualificadosRepository } from '@/modules/documentos-qualificados/domain/ports/IDocumentosQualificadosRepository.js'
import { SolicitacaoNotFoundError } from '@/modules/documentos-qualificados/domain/errors/DocumentosQualificadosErrors.js'

export interface CancelarSolicitacaoResult {
  id: number
}

export class CancelarSolicitacaoUseCase {
  constructor(private readonly repo: IDocumentosQualificadosRepository) {}

  async execute(tenantId: number, id: number): Promise<CancelarSolicitacaoResult> {
    const s = await this.repo.findSolicitacaoById(tenantId, id)
    if (!s) throw new SolicitacaoNotFoundError(id)

    const updated = await this.repo.cancelSolicitacao(tenantId, id)
    return { id: updated.id }
  }
}
