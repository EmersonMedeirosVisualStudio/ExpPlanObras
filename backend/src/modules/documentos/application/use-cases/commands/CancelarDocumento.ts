import type { IDocumentosRepository } from '@/modules/documentos/domain/ports/IDocumentosRepository.js'
import { DocumentoNotFoundError } from '@/modules/documentos/domain/errors/DocumentoErrors.js'

export interface CancelarDocumentoInput {
  tenantId: number
  id: number
}

export class CancelarDocumentoUseCase {
  constructor(private readonly repo: IDocumentosRepository) {}

  async execute(input: CancelarDocumentoInput): Promise<void> {
    const { tenantId, id } = input

    const doc = await this.repo.findUniqueDocumento(id).catch(() => null)
    if (!doc || doc.tenantId !== tenantId) throw new DocumentoNotFoundError(id)

    await this.repo.updateDocumento(doc.id, {
      statusDocumento: 'CANCELADO',
      updatedAt: new Date(),
    } as never)
  }
}
