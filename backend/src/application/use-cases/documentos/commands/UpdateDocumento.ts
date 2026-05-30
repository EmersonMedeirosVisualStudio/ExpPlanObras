import type { IDocumentosRepository } from '@/domain/repositories/IDocumentosRepository.js'
import { DocumentoNotFoundError } from '@/domain/errors/DocumentoErrors.js'

export interface UpdateDocumentoInput {
  tenantId: number
  id: number
  tituloDocumento?: string | null
  descricaoDocumento?: string | null
}

export class UpdateDocumentoUseCase {
  constructor(private readonly repo: IDocumentosRepository) {}

  async execute(input: UpdateDocumentoInput): Promise<void> {
    const { tenantId, id, tituloDocumento, descricaoDocumento } = input

    const doc = await this.repo.findUniqueDocumento(id).catch(() => null)
    if (!doc || doc.tenantId !== tenantId) throw new DocumentoNotFoundError(id)

    await this.repo.updateDocumento(doc.id, {
      tituloDocumento: tituloDocumento ?? undefined,
      name: tituloDocumento ?? undefined,
      descricaoDocumento: descricaoDocumento === undefined ? undefined : descricaoDocumento,
      updatedAt: new Date(),
    })
  }
}
