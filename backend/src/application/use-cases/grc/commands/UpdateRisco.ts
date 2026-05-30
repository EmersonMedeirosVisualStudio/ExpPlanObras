import type { IGrcRepository } from '@/domain/repositories/IGrcRepository.js'
import { GrcRiscoNotFoundError } from '@/domain/errors/GrcErrors.js'

export interface UpdateRiscoInput {
  id: number
  tenantId: number
  titulo?: string
  descricao?: string | null
  statusRisco?: string
  ownerUserId?: number | null
  apetiteScore?: number | null
  toleranciaScore?: number | null
}

export class UpdateRisco {
  constructor(private readonly repo: IGrcRepository) {}

  async execute(input: UpdateRiscoInput) {
    const risco = await this.repo.findUniqueRisco(input.id)
    if (!risco || risco.tenantId !== input.tenantId) throw new GrcRiscoNotFoundError(input.id)
    await this.repo.updateRisco(risco.id, {
      titulo: input.titulo != null ? String(input.titulo) : undefined,
      descricao: input.descricao !== undefined ? input.descricao : undefined,
      statusRisco: input.statusRisco != null ? input.statusRisco.toUpperCase() : undefined,
      ownerUserId: input.ownerUserId !== undefined ? input.ownerUserId : undefined,
      apetiteScore: input.apetiteScore !== undefined ? input.apetiteScore : undefined,
      toleranciaScore: input.toleranciaScore !== undefined ? input.toleranciaScore : undefined,
    })
  }
}
