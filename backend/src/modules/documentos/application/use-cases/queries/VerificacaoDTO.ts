import crypto from 'crypto'
import type { VersaoRow, DocumentoRow } from '@/modules/documentos/domain/ports/IDocumentosRepository.js'

export interface VerificacaoSignatario {
  nome: string
  papel: string
  dataHora: string
  decisao: string
  codigo: string
}

export interface VerificacaoDTO {
  valido: boolean
  tituloDocumento: string
  numeroVersao: number
  hashConferido: string | null
  hashEsperado: string | null
  assinado: boolean
  signatarios: VerificacaoSignatario[]
}

function sha256Hex(buf: Buffer): string {
  return crypto.createHash('sha256').update(buf).digest('hex')
}

export function buildVerificacaoDTO(versao: VersaoRow, documento: DocumentoRow): VerificacaoDTO {
  const blob = versao.conteudoPdfCarimbado ?? versao.conteudoOriginal
  const buf = blob ? Buffer.from(blob as unknown as ArrayBuffer) : null
  const hashConferido = buf ? sha256Hex(buf) : null
  const hashEsperado = versao.conteudoPdfCarimbado
    ? (versao.hashSha256PdfCarimbado ?? null)
    : (versao.hashSha256Original ?? null)

  const assinaturas = Array.isArray(versao.assinaturasJson) ? (versao.assinaturasJson as Record<string, unknown>[]) : []

  return {
    valido: Boolean(hashConferido && hashEsperado && hashConferido === hashEsperado),
    tituloDocumento: String(documento.tituloDocumento ?? documento.name ?? ''),
    numeroVersao: Number(versao.numeroVersao ?? 1),
    hashConferido,
    hashEsperado,
    assinado: assinaturas.length > 0,
    signatarios: assinaturas.map((a) => ({
      nome: String(a['nomeExibicaoSignatario'] ?? ''),
      papel: String(a['papelSignatario'] ?? ''),
      dataHora: String(a['criadoEm'] ?? ''),
      decisao: String(a['tipoDecisao'] ?? ''),
      codigo: String(a['codigoVerificacao'] ?? ''),
    })),
  }
}
