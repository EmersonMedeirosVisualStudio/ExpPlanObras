import type { IGrcRepository } from '@/domain/repositories/IGrcRepository.js'

export interface CreateAuditoriaInput {
  tenantId: number
  userId: number
  codigo: string
  nome: string
  tipoAuditoria: string
  statusAuditoria: string
  escopoDescricao?: string | null
  auditorLiderUserId?: number | null
  dataInicioPlanejada?: Date | null
  dataFimPlanejada?: Date | null
}

export class CreateAuditoria {
  constructor(private readonly repo: IGrcRepository) {}

  async execute(input: CreateAuditoriaInput) {
    const created = await this.repo.createAuditoria({
      tenantId: input.tenantId,
      codigo: input.codigo.toUpperCase(),
      nome: input.nome,
      tipoAuditoria: input.tipoAuditoria,
      statusAuditoria: input.statusAuditoria.toUpperCase(),
      escopoDescricao: input.escopoDescricao ?? null,
      ownerUserId: input.userId,
      auditorLiderUserId: input.auditorLiderUserId ?? null,
      dataInicioPlanejada: input.dataInicioPlanejada ?? null,
      dataFimPlanejada: input.dataFimPlanejada ?? null,
    })
    return { id: created.id }
  }
}
