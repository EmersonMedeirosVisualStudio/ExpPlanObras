export interface ListDocumentosFilter {
  tenantId: number
  entidadeTipo?: string | null
  entidadeId?: number | null
  categoriaPrefix?: string | null
  incluirObrasDoContrato?: boolean
  limit?: number
}

export interface CreateDocumentoInput {
  tenantId: number
  obraId: number | null
  contratoId: number | null
  name: string
  type: string
  url: string
  categoriaDocumento: string
  tituloDocumento: string
  descricaoDocumento: string | null
  statusDocumento: string
}

export interface UpdateDocumentoInput {
  tituloDocumento?: string
  name?: string
  descricaoDocumento?: string | null
  url?: string
  updatedAt?: Date
}

export interface CreateVersaoInput {
  tenantId: number
  documentoId: number
  numeroVersao: number
  urlOriginal: string
  nomeArquivoOriginal: string
  mimeType: string
  tamanhoBytes: number
  conteudoOriginal: Buffer
  hashSha256Original: string
  statusVersao: string
  verificacaoToken: string
  updatedAt: Date
}

export interface UpdateVersaoInput {
  urlOriginal?: string
  fluxoJson?: unknown[]
  assinaturasJson?: unknown[]
  conteudoPdfCarimbado?: Buffer
  hashSha256PdfCarimbado?: string
  finalizadaEm?: Date
  updatedAt?: Date
}

export interface UpdateDocumentoVersaoAtualInput {
  idVersaoAtual: number
  url: string
  updatedAt: Date
}

export interface DocumentoRow {
  id: number
  tenantId: number
  obraId: number | null
  contratoId: number | null
  name: string
  type: string
  url: string
  categoriaDocumento: string | null
  tituloDocumento: string | null
  descricaoDocumento: string | null
  statusDocumento: string | null
  idVersaoAtual: number | null
  uploadedAt: Date
  updatedAt: Date | null
}

export interface VersaoRow {
  id: number
  tenantId: number
  documentoId: number
  numeroVersao: number
  urlOriginal: string
  nomeArquivoOriginal: string
  mimeType: string
  tamanhoBytes: number
  conteudoOriginal: Buffer | null
  conteudoPdfCarimbado: Buffer | null
  hashSha256Original: string
  hashSha256PdfCarimbado: string | null
  statusVersao: string
  verificacaoToken: string | null
  fluxoJson: unknown[]
  assinaturasJson: unknown[]
  historicoJson: unknown[]
  finalizadaEm: Date | null
  createdAt: Date
}

export interface VersaoWithDocumento extends VersaoRow {
  documento: DocumentoRow
}

export interface ObraIdRow {
  id: number
}

export interface TenantUserRow {
  id: number
}

export interface IDocumentosRepository {
  // documento
  findManyDocumentos(filter: ListDocumentosFilter): Promise<DocumentoRow[]>
  createDocumento(input: CreateDocumentoInput): Promise<{ id: number }>
  findUniqueDocumento(id: number): Promise<DocumentoRow | null>
  updateDocumento(id: number, data: UpdateDocumentoInput): Promise<void>

  // documentoVersao
  findManyVersoes(tenantId: number, documentoId: number): Promise<VersaoRow[]>
  findFirstVersao(tenantId: number, documentoId: number): Promise<{ numeroVersao: number } | null>
  findUniqueVersao(id: number): Promise<VersaoRow | null>
  findUniqueVersaoWithDocumento(id: number): Promise<VersaoWithDocumento | null>
  findFirstVersaoByToken(token: string): Promise<VersaoWithDocumento | null>
  createVersao(input: CreateVersaoInput): Promise<{ id: number }>
  updateVersao(id: number, data: UpdateVersaoInput): Promise<void>

  // obra (for contract-level search)
  findObrasByContrato(tenantId: number, contratoId: number): Promise<ObraIdRow[]>

  // tenantUser (auth check)
  findTenantUser(tenantId: number, userId: number): Promise<TenantUserRow | null>

  // transactions
  updateVersaoAndDocumentoTx(
    versaoId: number,
    versaoData: UpdateVersaoInput,
    documentoId: number,
    documentoData: UpdateDocumentoVersaoAtualInput,
  ): Promise<void>
}
