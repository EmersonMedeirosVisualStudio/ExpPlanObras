import type { IDocumentosRepository } from '@/domain/repositories/IDocumentosRepository.js'
import { VersaoTokenInvalidoError } from '@/domain/errors/DocumentoErrors.js'
import type { VerificacaoDTO } from '@/application/use-cases/documentos/queries/VerificacaoDTO.js'
import { buildVerificacaoDTO } from '@/application/use-cases/documentos/queries/VerificacaoDTO.js'

export class VerificarByTokenUseCase {
  constructor(private readonly repo: IDocumentosRepository) {}

  async execute(token: string): Promise<VerificacaoDTO> {
    const v = await this.repo.findFirstVersaoByToken(token).catch(() => null)
    if (!v) throw new VersaoTokenInvalidoError()
    return buildVerificacaoDTO(v, v.documento)
  }
}
