// ─── Shared filter / input types ─────────────────────────────────────────────

export interface ListSolicitacoesFilter {
  status?: string
  pagina?: number
  limite?: number
}

export interface CreateProvedorInput {
  nome: string
  codigo: string
  tipo: string
  ambiente: string
  baseUrl: string
  clientId?: string | null
  clientSecretCriptografado?: string | null
  apiKeyCriptografada?: string | null
  configuracaoJson?: unknown
  ativo: boolean
}

export interface CreateSolicitacaoInput {
  documentoId: number
  versaoId: number
  provedorId: number
  tipoAssinatura: string
  exigeTodosSignatarios: boolean
  callbackToken: string
  expiraEm?: Date | null
  solicitanteUserId: number
  metadataJson?: unknown
  signatarios: Array<{
    ordemAssinatura: number
    tipoSignatario: string
    userId?: number | null
    nomeSignatario: string
    emailSignatario: string
    documentoSignatario?: string | null
    papelSignatario: string
    assinaturaObrigatoria: boolean
    statusSignatario: string
  }>
}

export interface CreateDocumentoVersaoInput {
  documentoId: number
  numeroVersao: number
  urlOriginal: string
}

export interface UpdateSolicitacaoAfterSendInput {
  providerEnvelopeId: string
  providerDocumentId?: string | null
  linkAssinaturaExterno?: string | null
  providerStatus: string
  statusSolicitacao: string
  enviadoEm: Date
  motivoErro: null
}

export interface UpdateSolicitacaoAfterSyncInput {
  providerStatus: string
  statusSolicitacao: string
  motivoErro: null
  concluidoEm?: Date | null
}

export interface CreateArtefatoInput {
  tenantId: number
  solicitacaoId: number
  tipoArtefato: string
  nomeArquivo: string
  mimeType: string
  tamanhoBytes: number
  hashSha256: string
  data: Uint8Array
}

export interface UpdateDocumentoVersaoAfterSignInput {
  urlAssinado: null
  hashSha256Assinado: string
  tipoAssinaturaFinal: string
  assinaturaQualificadaConcluida: boolean
  verificacaoAssinaturaStatus: string
  verificacaoAssinaturaEm: null
}

export interface UpdateVerificacaoInput {
  verificacaoAssinaturaStatus: string
  verificacaoAssinaturaEm: Date
}

export interface CreateCallbackInput {
  tenantId: number
  solicitacaoId?: number | null
  provedorId: number
  providerEvento: string
  providerRequestId?: string | null
  payloadJson: unknown
  statusProcessamento: string
}

export interface SolicitacaoRow {
  id: number
  tenantId: number
  documentoId: number
  versaoId: number
  provedorId: number
  tipoAssinatura: string
  statusSolicitacao: string
  providerEnvelopeId: string | null
  providerDocumentId: string | null
  providerStatus: string | null
  linkAssinaturaExterno: string | null
  callbackToken: string | null
  exigeTodosSignatarios: boolean
  solicitanteUserId: number | null
  enviadoEm: Date | null
  concluidoEm: Date | null
  expiraEm: Date | null
  motivoErro: string | null
  metadataJson: unknown
  createdAt: Date
  updatedAt: Date
}

export interface SolicitacaoWithRelations extends SolicitacaoRow {
  provedor: {
    id?: number
    codigo: string
    tipo: string
    ambiente: string
    baseUrl?: string
    configuracaoJson?: unknown
  }
  signatarios?: SignatarioRow[]
  artefatos?: ArtefatoRow[]
  evidencias?: EvidenciaRow[]
  versao?: VersaoRow
}

export interface SignatarioRow {
  id: number
  tenantId: number
  solicitacaoId: number
  ordemAssinatura: number
  tipoSignatario: string
  userId: number | null
  nomeSignatario: string
  emailSignatario: string
  documentoSignatario: string | null
  papelSignatario: string
  assinaturaObrigatoria: boolean
  statusSignatario: string
  assinadoEm: Date | null
  createdAt: Date
  updatedAt: Date
}

export interface ArtefatoRow {
  id: number
  tenantId: number
  solicitacaoId: number
  tipoArtefato: string
  nomeArquivo: string
  mimeType: string
  tamanhoBytes: number
  hashSha256: string
  data?: Uint8Array | null
  createdAt: Date
}

export interface EvidenciaRow {
  id: number
  tenantId: number
  solicitacaoId: number
  createdAt: Date
  [key: string]: unknown
}

export interface VersaoRow {
  id: number
  tenantId: number
  documentoId: number
  numeroVersao: number
  urlOriginal: string
  urlAssinado: string | null
  hashSha256Assinado: string | null
  tipoAssinaturaFinal: string | null
  assinaturaQualificadaConcluida: boolean
  verificacaoAssinaturaStatus: string | null
  verificacaoAssinaturaEm: Date | null
  createdAt: Date
  updatedAt: Date
}

export interface ProvedorRow {
  id: number
  tenantId: number
  nome: string
  codigo: string
  tipo: string
  ambiente: string
  baseUrl: string
  configuracaoJson: unknown
  clientId: string | null
  clientSecretCriptografado: string | null
  apiKeyCriptografada: string | null
  ativo: boolean
  createdAt: Date
  updatedAt: Date
}

export interface DocumentoRow {
  id: number
  tenantId: number
  url: string
  [key: string]: unknown
}

export interface TenantUserRow {
  role: string
}

export interface EmpresaEncarregadoRow {
  userId: number | null
}

// ─── Sync result type ────────────────────────────────────────────────────────

export interface SyncSolicitacaoResult {
  solicitacao: SolicitacaoRow
  signedArtifactId: number | null
  concluded: boolean
}

// ─── Repository interface ─────────────────────────────────────────────────────

export interface IDocumentosQualificadosRepository {
  // Auth helpers
  findTenantUser(tenantId: number, userId: number): Promise<TenantUserRow | null>
  findEmpresaEncarregado(tenantId: number): Promise<EmpresaEncarregadoRow | null>

  // Provedores
  listProvedores(tenantId: number): Promise<ProvedorRow[]>
  createProvedor(tenantId: number, input: CreateProvedorInput): Promise<ProvedorRow>
  findProvedorById(tenantId: number, id: number): Promise<ProvedorRow | null>
  findProvedorByCode(code: string): Promise<ProvedorRow | null>

  // Documentos
  findDocumentoById(tenantId: number, id: number): Promise<DocumentoRow | null>

  // Versões
  findVersaoById(tenantId: number, id: number): Promise<VersaoRow | null>
  createVersao(tenantId: number, input: CreateDocumentoVersaoInput): Promise<VersaoRow>
  updateVersaoAfterSign(tenantId: number, versaoId: number, input: UpdateDocumentoVersaoAfterSignInput): Promise<VersaoRow>
  updateVersaoVerificacao(tenantId: number, versaoId: number, input: UpdateVerificacaoInput): Promise<VersaoRow>

  // Solicitações
  listSolicitacoes(tenantId: number, filter: ListSolicitacoesFilter): Promise<{ rows: SolicitacaoRow[]; total: number }>
  findSolicitacaoById(tenantId: number, id: number): Promise<SolicitacaoWithRelations | null>
  findSolicitacaoForSend(tenantId: number, id: number): Promise<SolicitacaoWithRelations | null>
  findSolicitacaoForSync(tenantId: number, id: number): Promise<SolicitacaoWithRelations | null>
  createSolicitacao(tenantId: number, input: CreateSolicitacaoInput): Promise<SolicitacaoRow>
  updateSolicitacaoAfterSend(tenantId: number, id: number, input: UpdateSolicitacaoAfterSendInput): Promise<SolicitacaoRow>
  cancelSolicitacao(tenantId: number, id: number): Promise<SolicitacaoRow>
  syncSolicitacao(
    tenantId: number,
    id: number,
    statusInput: UpdateSolicitacaoAfterSyncInput,
    signedArtifact: CreateArtefatoInput | null,
    versaoId: number,
    versaoUpdate: UpdateDocumentoVersaoAfterSignInput | null,
    tipoAssinatura: string,
  ): Promise<SyncSolicitacaoResult>

  // Artefatos
  listArtefatos(tenantId: number, solicitacaoId: number): Promise<ArtefatoRow[]>
  findFirstSignedArtefato(tenantId: number, solicitacaoId: number): Promise<ArtefatoRow | null>

  // Callbacks
  findSolicitacaoByCallbackToken(tenantId: number, provedorId: number, token: string): Promise<SolicitacaoRow | null>
  createCallback(input: CreateCallbackInput): Promise<void>
}
