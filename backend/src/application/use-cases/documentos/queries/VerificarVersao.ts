import type { IDocumentosRepository } from '@/domain/repositories/IDocumentosRepository.js'
import { VersaoNotFoundError } from '@/domain/errors/DocumentoErrors.js'
import type { VerificacaoDTO } from '@/application/use-cases/documentos/queries/VerificacaoDTO.js'
import { buildVerificacaoDTO } from '@/application/use-cases/documentos/queries/VerificacaoDTO.js'

export class VerificarVersaoUseCase {
  constructor(private readonly repo: IDocumentosRepository) {}

  async execute(tenantId: number, id: number): Promise<VerificacaoDTO> {
    const v = await this.repo.findUniqueVersaoWithDocumento(id).catch(() => null)
    if (!v || v.tenantId !== tenantId || v.documento.tenantId !== tenantId) throw new VersaoNotFoundError(id)
    return buildVerificacaoDTO(v, v.documento)
  }
}
