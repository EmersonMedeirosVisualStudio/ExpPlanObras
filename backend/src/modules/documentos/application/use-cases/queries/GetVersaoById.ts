import type { IDocumentosRepository, VersaoWithDocumento } from '@/modules/documentos/domain/ports/IDocumentosRepository.js'
import { VersaoNotFoundError } from '@/modules/documentos/domain/errors/DocumentoErrors.js'

export class GetVersaoByIdUseCase {
  constructor(private readonly repo: IDocumentosRepository) {}

  async execute(tenantId: number, id: number): Promise<VersaoWithDocumento> {
    const v = await this.repo.findUniqueVersaoWithDocumento(id).catch(() => null)
    if (!v || v.tenantId !== tenantId || v.documento.tenantId !== tenantId) throw new VersaoNotFoundError(id)
    return v
  }
}
