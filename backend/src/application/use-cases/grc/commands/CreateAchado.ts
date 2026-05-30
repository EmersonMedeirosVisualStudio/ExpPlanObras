import type { IGrcRepository } from '@/domain/repositories/IGrcRepository.js'

export interface CreateAchadoInput {
  tenantId: number
  userId: number
  auditoriaId?: number | null
  riscoId?: number | null
  controleId?: number | null
  incidenteId?: number | null
  criseId?: number | null
  titulo: string
  descricao?: string | null
  gravidade: string
  statusAchado: string
  causaRaiz?: string | null
  impactoResumo?: string | null
  recomendacao?: string | null
  ownerUserId?: number | null
  prazoTratativaEm?: Date | null
}

export class CreateAchado {
  constructor(private readonly repo: IGrcRepository) {}

  async execute(input: CreateAchadoInput) {
    const created = await this.repo.createAchado({
      tenantId: input.tenantId,
      auditoriaId: input.auditoriaId ?? null,
      riscoId: input.riscoId ?? null,
      controleId: input.controleId ?? null,
      incidenteId: input.incidenteId ?? null,
      criseId: input.criseId ?? null,
      titulo: input.titulo,
      descricao: input.descricao ?? null,
      gravidade: input.gravidade,
      statusAchado: input.statusAchado,
      causaRaiz: input.causaRaiz ?? null,
      impactoResumo: input.impactoResumo ?? null,
      recomendacao: input.recomendacao ?? null,
      ownerUserId: typeof input.ownerUserId === 'number' ? input.ownerUserId : input.userId,
      prazoTratativaEm: input.prazoTratativaEm ?? null,
    })
    return { id: created.id }
  }
}
