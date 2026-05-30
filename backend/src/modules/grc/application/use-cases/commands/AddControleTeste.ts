import type { IGrcRepository } from '@/modules/grc/domain/ports/IGrcRepository.js'
import { GrcControleNotFoundError } from '@/modules/grc/domain/errors/GrcErrors.js'

export interface AddControleTesteInput {
  tenantId: number
  userId: number
  controleId: number
  tipoTeste: string
  periodoReferencia?: string | null
  amostraJson?: unknown
  resultadoTeste: string
  falhasIdentificadas?: string | null
  efetividadeScore?: number | null
  conclusao?: string | null
}

export class AddControleTeste {
  constructor(private readonly repo: IGrcRepository) {}

  async execute(input: AddControleTesteInput) {
    const controle = await this.repo.findUniqueControle(input.controleId)
    if (!controle || controle.tenantId !== input.tenantId) {
      throw new GrcControleNotFoundError(input.controleId)
    }
    const created = await this.repo.createControleTeste({
      tenantId: input.tenantId,
      controleId: controle.id,
      tipoTeste: input.tipoTeste,
      periodoReferencia: input.periodoReferencia ?? null,
      amostraJson: input.amostraJson ?? null,
      resultadoTeste: input.resultadoTeste,
      falhasIdentificadas: input.falhasIdentificadas ?? null,
      efetividadeScore: input.efetividadeScore ?? null,
      executadoPor: input.userId,
      conclusao: input.conclusao ?? null,
    })
    return { id: created.id }
  }
}
