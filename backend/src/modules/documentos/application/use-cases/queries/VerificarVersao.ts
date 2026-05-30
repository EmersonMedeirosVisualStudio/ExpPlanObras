import type { IDocumentosRepository } from '@/modules/documentos/domain/ports/IDocumentosRepository.js'
import { VersaoNotFoundError } from '@/modules/documentos/domain/errors/DocumentoErrors.js'
import type { VerificacaoDTO } from '@/modules/documentos/application/use-cases/queries/VerificacaoDTO.js'
import { buildVerificacaoDTO } from '@/modules/documentos/application/use-cases/queries/VerificacaoDTO.js'

export class VerificarVersaoUseCase {
  constructor(private readonly repo: IDocumentosRepository) {}

  async execute(tenantId: number, id: number): Promise<VerificacaoDTO> {
    const v = await this.repo.findUniqueVersaoWithDocumento(id).catch(() => null)
    if (!v || v.tenantId !== tenantId || v.documento.tenantId !== tenantId) throw new VersaoNotFoundError(id)
    return buildVerificacaoDTO(v, v.documento)
  }
}
