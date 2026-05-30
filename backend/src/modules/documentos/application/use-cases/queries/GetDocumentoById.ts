import type { IDocumentosRepository, DocumentoRow, VersaoRow } from '@/modules/documentos/domain/ports/IDocumentosRepository.js'
import { DocumentoNotFoundError } from '@/modules/documentos/domain/errors/DocumentoErrors.js'

export interface GetDocumentoByIdResult {
  documento: DocumentoRow
  versoes: VersaoRow[]
}

export class GetDocumentoByIdUseCase {
  constructor(private readonly repo: IDocumentosRepository) {}

  async execute(tenantId: number, id: number): Promise<GetDocumentoByIdResult> {
    const doc = await this.repo.findUniqueDocumento(id).catch(() => null)
    if (!doc || doc.tenantId !== tenantId) throw new DocumentoNotFoundError(id)

    const versoes = await this.repo.findManyVersoes(tenantId, doc.id)

    return { documento: doc, versoes }
  }
}
