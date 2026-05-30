import type {
  IDocumentosQualificadosRepository,
  SolicitacaoWithRelations,
} from '@/domain/repositories/IDocumentosQualificadosRepository.js'
import { SolicitacaoNotFoundError } from '@/domain/errors/DocumentosQualificadosErrors.js'

export class GetSolicitacaoByIdUseCase {
  constructor(private readonly repo: IDocumentosQualificadosRepository) {}

  async execute(tenantId: number, id: number): Promise<SolicitacaoWithRelations> {
    const row = await this.repo.findSolicitacaoById(tenantId, id)
    if (!row) throw new SolicitacaoNotFoundError(id)
    return row
  }
}
