import type { IDocumentosRepository } from '@/modules/documentos/domain/ports/IDocumentosRepository.js'

export interface CreateDocumentoInput {
  tenantId: number
  entidadeTipo: string | null
  entidadeId: number | null
  categoriaDocumento: string
  tituloDocumento: string
  descricaoDocumento: string | null
  baseUrl: string
}

export interface CreateDocumentoResult {
  id: number
}

export class CreateDocumentoUseCase {
  constructor(private readonly repo: IDocumentosRepository) {}

  async execute(input: CreateDocumentoInput): Promise<CreateDocumentoResult> {
    const { tenantId, entidadeTipo, entidadeId, categoriaDocumento, tituloDocumento, descricaoDocumento, baseUrl } = input

    const obraId = entidadeTipo === 'OBRA' && entidadeId ? entidadeId : null
    const contratoId = entidadeTipo === 'CONTRATO' && entidadeId ? entidadeId : null

    const created = await this.repo.createDocumento({
      tenantId,
      obraId,
      contratoId,
      name: tituloDocumento,
      type: categoriaDocumento,
      url: baseUrl ? `${baseUrl}/api/v1/documentos/0/download` : 'about:blank',
      categoriaDocumento,
      tituloDocumento,
      descricaoDocumento: descricaoDocumento ?? null,
      statusDocumento: 'ATIVO',
    })

    const url = baseUrl
      ? `${baseUrl}/api/v1/documentos/${created.id}/download`
      : `/api/v1/documentos/${created.id}/download`

    await this.repo.updateDocumento(created.id, { url })

    return { id: created.id }
  }
}
