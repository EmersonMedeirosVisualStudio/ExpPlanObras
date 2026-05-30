import type { IGrcRepository } from '@/domain/repositories/IGrcRepository.js'
import { GrcRiscoNotFoundError } from '@/domain/errors/GrcErrors.js'
import { scoreFromImpactProbability } from '@/infra/providers/grc/score.js'

export interface AddRiscoAvaliacaoInput {
  riscoId: number
  tenantId: number
  userId: number
  tipoAvaliacao: string
  impacto: string
  probabilidade: string
  justificativa?: string | null
  aplicarComoResidual: boolean
}

export class AddRiscoAvaliacao {
  constructor(private readonly repo: IGrcRepository) {}

  async execute(input: AddRiscoAvaliacaoInput) {
    const risco = await this.repo.findUniqueRisco(input.riscoId)
    if (!risco || risco.tenantId !== input.tenantId) throw new GrcRiscoNotFoundError(input.riscoId)
    const score = scoreFromImpactProbability({ impacto: input.impacto, probabilidade: input.probabilidade })
    await this.repo.addAvaliacaoTransaction({
      avaliacao: {
        tenantId: input.tenantId,
        riscoId: risco.id,
        tipoAvaliacao: input.tipoAvaliacao,
        impacto: input.impacto,
        probabilidade: input.probabilidade,
        score,
        justificativa: input.justificativa ?? null,
        avaliadoPor: input.userId,
      },
      aplicarComoResidual: input.aplicarComoResidual,
      riscoId: risco.id,
      impacto: input.impacto,
      probabilidade: input.probabilidade,
      score,
    })
    return { score }
  }
}
