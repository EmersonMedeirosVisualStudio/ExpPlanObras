import type { IDocumentosRepository } from '@/domain/repositories/IDocumentosRepository.js'
import { VersaoNotFoundError, VersaoArquivoIndisponivel } from '@/domain/errors/DocumentoErrors.js'

export type DownloadTipo = 'ORIGINAL' | 'PDF_FINAL'

export interface DownloadVersaoResult {
  buffer: Buffer
  mimeType: string
  filename: string
  documentoId: number
  numeroVersao: number
}

export class DownloadVersaoUseCase {
  constructor(private readonly repo: IDocumentosRepository) {}

  async execute(tenantId: number, id: number, tipo: DownloadTipo): Promise<DownloadVersaoResult> {
    const v = await this.repo.findUniqueVersaoWithDocumento(id).catch(() => null)
    if (!v || v.tenantId !== tenantId || v.documento.tenantId !== tenantId) throw new VersaoNotFoundError(id)

    const blob = tipo === 'PDF_FINAL' ? v.conteudoPdfCarimbado : v.conteudoOriginal
    if (!blob) throw new VersaoArquivoIndisponivel()

    const buffer = Buffer.from(blob as unknown as ArrayBuffer)
    const mimeType = tipo === 'PDF_FINAL' ? 'application/pdf' : String(v.mimeType || 'application/octet-stream')
    const name = String(v.nomeArquivoOriginal || `documento-${v.documentoId}-v${v.numeroVersao}`)
    const filename = tipo === 'PDF_FINAL' && !name.toLowerCase().endsWith('.pdf') ? `${name}.pdf` : name

    return { buffer, mimeType, filename, documentoId: v.documentoId, numeroVersao: Number(v.numeroVersao) }
  }
}
