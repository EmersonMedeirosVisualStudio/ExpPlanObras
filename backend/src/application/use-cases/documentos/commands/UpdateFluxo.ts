import type { IDocumentosRepository } from '@/domain/repositories/IDocumentosRepository.js'
import { VersaoNotFoundError } from '@/domain/errors/DocumentoErrors.js'

export interface FluxoItem {
  ordemAssinatura: number
  papelSignatario: string
  tipoSignatario: 'USUARIO' | 'PERMISSAO'
  idUsuarioSignatario: number | null
  permissaoSignatario: string | null
  assinaturaObrigatoria: boolean
  parecerObrigatorio: boolean
  vencimentoEm?: string | null
}

export interface UpdateFluxoInput {
  tenantId: number
  versaoId: number
  itens: FluxoItem[]
}

export class UpdateFluxoUseCase {
  constructor(private readonly repo: IDocumentosRepository) {}

  async execute(input: UpdateFluxoInput): Promise<void> {
    const { tenantId, versaoId, itens } = input

    const v = await this.repo.findUniqueVersao(versaoId).catch(() => null)
    if (!v || v.tenantId !== tenantId) throw new VersaoNotFoundError(versaoId)

    await this.repo.updateVersao(versaoId, { fluxoJson: itens, updatedAt: new Date() })
  }
}
