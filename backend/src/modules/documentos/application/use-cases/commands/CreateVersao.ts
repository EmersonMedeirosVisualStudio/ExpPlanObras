import type { IDocumentosRepository } from '@/modules/documentos/domain/ports/IDocumentosRepository.js'
import { DocumentoNotFoundError } from '@/modules/documentos/domain/errors/DocumentoErrors.js'

export interface CreateVersaoInput {
  tenantId: number
  documentoId: number
  nome: string
  mimeType: string
  buffer: Buffer
  hash: string
  token: string
  baseUrl: string
}

export interface CreateVersaoResult {
  id: number
  token: string
}

export class CreateVersaoUseCase {
  constructor(private readonly repo: IDocumentosRepository) {}

  async execute(input: CreateVersaoInput): Promise<CreateVersaoResult> {
    const { tenantId, documentoId, nome, mimeType, buffer, hash, token, baseUrl } = input

    const doc = await this.repo.findUniqueDocumento(documentoId).catch(() => null)
    if (!doc || doc.tenantId !== tenantId) throw new DocumentoNotFoundError(documentoId)

    const last = await this.repo.findFirstVersao(tenantId, doc.id)
    const numeroVersao = Number(last?.numeroVersao ?? 0) + 1

    const created = await this.repo.createVersao({
      tenantId,
      documentoId: doc.id,
      numeroVersao,
      urlOriginal: baseUrl ? `${baseUrl}/api/v1/documentos/versoes/0/download?tipo=ORIGINAL` : 'about:blank',
      nomeArquivoOriginal: nome,
      mimeType,
      tamanhoBytes: buffer.length,
      conteudoOriginal: buffer,
      hashSha256Original: hash,
      statusVersao: 'ATIVA',
      verificacaoToken: token,
      updatedAt: new Date(),
    })

    const urlOriginal = baseUrl
      ? `${baseUrl}/api/v1/documentos/versoes/${created.id}/download?tipo=ORIGINAL`
      : `/api/v1/documentos/versoes/${created.id}/download?tipo=ORIGINAL`

    await this.repo.updateVersaoAndDocumentoTx(
      created.id,
      { urlOriginal, updatedAt: new Date() },
      doc.id,
      {
        idVersaoAtual: created.id,
        url: baseUrl
          ? `${baseUrl}/api/v1/documentos/versoes/${created.id}/download?tipo=ORIGINAL`
          : `/api/v1/documentos/versoes/${created.id}/download?tipo=ORIGINAL`,
        updatedAt: new Date(),
      },
    )

    return { id: created.id, token }
  }
}
