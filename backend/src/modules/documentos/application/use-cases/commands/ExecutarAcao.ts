import crypto from 'crypto'
import type { IDocumentosRepository } from '@/modules/documentos/domain/ports/IDocumentosRepository.js'
import { VersaoNotFoundError } from '@/modules/documentos/domain/errors/DocumentoErrors.js'

function sha256Hex(buf: Buffer): string {
  return crypto.createHash('sha256').update(buf).digest('hex')
}

export interface AssinaturaInput {
  tipo: string
  pin?: string
}

export interface ExecutarAcaoInput {
  tenantId: number
  versaoId: number
  acao: string
  parecer?: string | null
  assinatura?: AssinaturaInput
  userEmail: string
  userId: number
}

export interface ExecutarAcaoResult {
  ok: boolean
}

export class ExecutarAcaoUseCase {
  constructor(private readonly repo: IDocumentosRepository) {}

  async execute(input: ExecutarAcaoInput): Promise<ExecutarAcaoResult> {
    const { tenantId, versaoId, acao, parecer, userEmail, userId } = input

    const v = await this.repo.findUniqueVersao(versaoId).catch(() => null)
    if (!v || v.tenantId !== tenantId) throw new VersaoNotFoundError(versaoId)

    const acaoUpper = acao.toUpperCase()

    if (acaoUpper === 'GERAR_PDF_FINAL') {
      const blob = v.conteudoPdfCarimbado ?? v.conteudoOriginal
      if (!blob) {
        const { VersaoArquivoIndisponivel } = await import('@/modules/documentos/domain/errors/DocumentoErrors.js')
        throw new VersaoArquivoIndisponivel()
      }

      const buf = Buffer.from(blob as unknown as ArrayBuffer)
      const hash = sha256Hex(buf)

      await this.repo.updateVersao(versaoId, {
        conteudoPdfCarimbado: buf,
        hashSha256PdfCarimbado: hash,
        finalizadaEm: new Date(),
        updatedAt: new Date(),
      })

      return { ok: true }
    }

    const nowIso = new Date().toISOString()
    const assinaturas = Array.isArray(v.assinaturasJson) ? (v.assinaturasJson as Record<string, unknown>[]) : []
    const codigo = crypto.randomBytes(10).toString('base64url')

    assinaturas.push({
      id: Date.now(),
      tipoDecisao: acaoUpper,
      nomeExibicaoSignatario: userEmail || `user#${userId}`,
      papelSignatario: 'USUARIO',
      parecer: parecer != null ? String(parecer) : null,
      codigoVerificacao: codigo,
      criadoEm: nowIso,
    })

    await this.repo.updateVersao(versaoId, { assinaturasJson: assinaturas, updatedAt: new Date() })

    return { ok: true }
  }
}
