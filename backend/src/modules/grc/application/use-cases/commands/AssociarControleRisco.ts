import type { IGrcRepository } from '@/modules/grc/domain/ports/IGrcRepository.js'
import { GrcControleNotFoundError, GrcRiscoNotFoundError } from '@/modules/grc/domain/errors/GrcErrors.js'

export interface AssociarControleRiscoInput {
  tenantId: number
  controleId: number
  riscoId: number
  papelControle: string
  pesoMitigacao: number
}

export class AssociarControleRisco {
  constructor(private readonly repo: IGrcRepository) {}

  async execute(input: AssociarControleRiscoInput) {
    const controle = await this.repo.findUniqueControle(input.controleId)
    if (!controle || controle.tenantId !== input.tenantId) {
      throw new GrcControleNotFoundError(input.controleId)
    }
    const risco = await this.repo.findUniqueRisco(input.riscoId)
    if (!risco || risco.tenantId !== input.tenantId) {
      throw new GrcRiscoNotFoundError(input.riscoId)
    }
    await this.repo.createRiscoControle({
      tenantId: input.tenantId,
      riscoId: risco.id,
      controleId: controle.id,
      papelControle: input.papelControle,
      pesoMitigacao: input.pesoMitigacao,
    })
  }
}
