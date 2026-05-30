import crypto from 'node:crypto'
import {
  DocumentoNotFoundError,
  DocumentoVersaoNotFoundError,
  InvalidExpiraEmError,
  ProvedorNotFoundError,
} from '@/domain/errors/DocumentosQualificadosErrors.js'
import type { IDocumentosQualificadosRepository, SolicitacaoRow } from '@/domain/repositories/IDocumentosQualificadosRepository.js'

export interface CreateSolicitacaoSignatarioInput {
  ordemAssinatura: number
  tipoSignatario: string
  userId?: number | null
  nome: string
  email: string
  documento?: string | null
  papel: string
  obrigatorio: boolean
}

export interface CreateSolicitacaoUseCaseInput {
  documentoId: number
  versaoId?: number | null
  provedorId: number
  tipoAssinatura: string
  exigeTodosSignatarios: boolean
  signatarios: CreateSolicitacaoSignatarioInput[]
  expiraEm?: string | null
  metadataJson?: unknown
}

export interface CreateSolicitacaoResult {
  id: number
  callbackToken: string
}

export class CreateSolicitacaoUseCase {
  constructor(private readonly repo: IDocumentosQualificadosRepository) {}

  async execute(tenantId: number, userId: number, input: CreateSolicitacaoUseCaseInput): Promise<CreateSolicitacaoResult> {
    const doc = await this.repo.findDocumentoById(tenantId, input.documentoId)
    if (!doc) throw new DocumentoNotFoundError(input.documentoId)

    let versaoId: number
    if (typeof input.versaoId === 'number' && input.versaoId > 0) {
      const v = await this.repo.findVersaoById(tenantId, input.versaoId)
      if (!v || v.documentoId !== doc.id) throw new DocumentoVersaoNotFoundError(input.versaoId)
      versaoId = v.id
    } else {
      const created = await this.repo.createVersao(tenantId, {
        documentoId: doc.id,
        numeroVersao: 1,
        urlOriginal: String(doc.url),
      })
      versaoId = created.id
    }

    const provedor = await this.repo.findProvedorById(tenantId, input.provedorId)
    if (!provedor) throw new ProvedorNotFoundError(input.provedorId)

    const expiraEm = input.expiraEm ? new Date(String(input.expiraEm)) : null
    if (expiraEm && Number.isNaN(expiraEm.getTime())) throw new InvalidExpiraEmError()

    const callbackToken = crypto.randomBytes(24).toString('base64url')

    const created: SolicitacaoRow = await this.repo.createSolicitacao(tenantId, {
      documentoId: doc.id,
      versaoId,
      provedorId: provedor.id,
      tipoAssinatura: String(input.tipoAssinatura),
      exigeTodosSignatarios: input.exigeTodosSignatarios !== false,
      callbackToken,
      expiraEm,
      solicitanteUserId: userId,
      metadataJson: input.metadataJson ?? null,
      signatarios: input.signatarios.map((p) => ({
        ordemAssinatura: p.ordemAssinatura,
        tipoSignatario: p.tipoSignatario,
        userId: typeof p.userId === 'number' ? p.userId : null,
        nomeSignatario: String(p.nome),
        emailSignatario: String(p.email),
        documentoSignatario: p.documento ? String(p.documento) : null,
        papelSignatario: String(p.papel || 'SIGNER'),
        assinaturaObrigatoria: p.obrigatorio !== false,
        statusSignatario: 'PENDENTE',
      })),
    })

    return { id: created.id, callbackToken }
  }
}
