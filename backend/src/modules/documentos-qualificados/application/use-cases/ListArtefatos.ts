import type {
  IDocumentosQualificadosRepository,
  ArtefatoRow,
} from '@/modules/documentos-qualificados/domain/ports/IDocumentosQualificadosRepository.js'
import { SolicitacaoNotFoundError } from '@/modules/documentos-qualificados/domain/errors/DocumentosQualificadosErrors.js'

export class ListArtefatosUseCase {
  constructor(private readonly repo: IDocumentosQualificadosRepository) {}

  async execute(tenantId: number, solicitacaoId: number): Promise<ArtefatoRow[]> {
    const s = await this.repo.findSolicitacaoById(tenantId, solicitacaoId)
    if (!s) throw new SolicitacaoNotFoundError(solicitacaoId)

    return this.repo.listArtefatos(tenantId, solicitacaoId)
  }
}
