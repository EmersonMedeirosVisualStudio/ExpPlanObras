import type { IDocumentosRepository } from '@/modules/documentos/domain/ports/IDocumentosRepository.js'
import { VersaoTokenInvalidoError } from '@/modules/documentos/domain/errors/DocumentoErrors.js'
import type { VerificacaoDTO } from '@/modules/documentos/application/use-cases/queries/VerificacaoDTO.js'
import { buildVerificacaoDTO } from '@/modules/documentos/application/use-cases/queries/VerificacaoDTO.js'

export class VerificarByTokenUseCase {
  constructor(private readonly repo: IDocumentosRepository) {}

  async execute(token: string): Promise<VerificacaoDTO> {
    const v = await this.repo.findFirstVersaoByToken(token).catch(() => null)
    if (!v) throw new VersaoTokenInvalidoError()
    return buildVerificacaoDTO(v, v.documento)
  }
}
