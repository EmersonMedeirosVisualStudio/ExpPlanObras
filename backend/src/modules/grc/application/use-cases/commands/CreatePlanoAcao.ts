import type { IGrcRepository } from '@/modules/grc/domain/ports/IGrcRepository.js'

export interface CreatePlanoAcaoInput {
  tenantId: number
  userId: number
  origemTipo: string
  origemId: number
  titulo: string
  descricao?: string | null
  criticidade: string
  ownerUserId?: number | null
  aprovadorUserId?: number | null
  dataLimite?: Date | null
  resultadoEsperado?: string | null
  criterioAceite?: string | null
}

export class CreatePlanoAcao {
  constructor(private readonly repo: IGrcRepository) {}

  async execute(input: CreatePlanoAcaoInput) {
    const created = await this.repo.createPlanoAcao({
      tenantId: input.tenantId,
      origemTipo: input.origemTipo,
      origemId: input.origemId,
      titulo: input.titulo,
      descricao: input.descricao ?? null,
      statusPlano: 'ABERTO',
      criticidade: input.criticidade,
      ownerUserId: typeof input.ownerUserId === 'number' ? input.ownerUserId : input.userId,
      aprovadorUserId: typeof input.aprovadorUserId === 'number' ? input.aprovadorUserId : null,
      dataLimite: input.dataLimite ?? null,
      resultadoEsperado: input.resultadoEsperado ?? null,
      criterioAceite: input.criterioAceite ?? null,
    })
    return { id: created.id }
  }
}
