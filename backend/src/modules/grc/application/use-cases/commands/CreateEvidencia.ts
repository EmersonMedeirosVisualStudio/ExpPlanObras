import type { IGrcRepository } from '@/modules/grc/domain/ports/IGrcRepository.js'

export interface CreateEvidenciaInput {
  tenantId: number
  userId: number
  referenciaTipo: string
  referenciaId: number
  tipoEvidencia: string
  titulo?: string | null
  descricao?: string | null
  arquivoPath?: string | null
  hashSha256?: string | null
  metadataJson?: unknown
}

export class CreateEvidencia {
  constructor(private readonly repo: IGrcRepository) {}

  async execute(input: CreateEvidenciaInput) {
    const created = await this.repo.createEvidencia({
      tenantId: input.tenantId,
      referenciaTipo: input.referenciaTipo.toUpperCase(),
      referenciaId: input.referenciaId,
      tipoEvidencia: input.tipoEvidencia.toUpperCase(),
      titulo: input.titulo ?? null,
      descricao: input.descricao ?? null,
      arquivoPath: input.arquivoPath ?? null,
      hashSha256: input.hashSha256 ?? null,
      coletadoPor: input.userId,
      metadataJson: input.metadataJson ?? null,
    })
    return { id: created.id }
  }
}
