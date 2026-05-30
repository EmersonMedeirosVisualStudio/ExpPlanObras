import type { IGrcRepository } from '@/modules/grc/domain/ports/IGrcRepository.js'
import { scoreFromImpactProbability } from '@/modules/grc/score.js'

export interface CreateRiscoInput {
  tenantId: number
  userId: number
  codigo: string
  titulo: string
  descricao?: string | null
  categoriaRisco: string
  modulo?: string | null
  processoNegocio?: string | null
  entidadeTipo?: string | null
  entidadeId?: number | null
  ownerUserId?: number | null
  statusRisco: string
  impacto: string
  probabilidade: string
  apetiteScore?: number | null
  toleranciaScore?: number | null
  origemRisco?: string | null
}

export class CreateRisco {
  constructor(private readonly repo: IGrcRepository) {}

  async execute(input: CreateRiscoInput) {
    const score = scoreFromImpactProbability({ impacto: input.impacto, probabilidade: input.probabilidade })
    const created = await this.repo.createRisco({
      tenantId: input.tenantId,
      codigo: input.codigo.toUpperCase(),
      titulo: input.titulo,
      descricao: input.descricao ?? null,
      categoriaRisco: input.categoriaRisco.toUpperCase(),
      modulo: input.modulo ?? null,
      processoNegocio: input.processoNegocio ?? null,
      entidadeTipo: input.entidadeTipo ?? null,
      entidadeId: input.entidadeId ?? null,
      ownerUserId: typeof input.ownerUserId === 'number' ? input.ownerUserId : input.userId,
      statusRisco: input.statusRisco,
      impactoInerente: input.impacto,
      probabilidadeInerente: input.probabilidade,
      scoreInerente: score,
      impactoResidual: null,
      probabilidadeResidual: null,
      scoreResidual: null,
      apetiteScore: input.apetiteScore ?? null,
      toleranciaScore: input.toleranciaScore ?? null,
      origemRisco: input.origemRisco ?? null,
    })
    await this.repo.createRiscoAvaliacao({
      tenantId: input.tenantId,
      riscoId: created.id,
      tipoAvaliacao: 'INICIAL',
      impacto: input.impacto,
      probabilidade: input.probabilidade,
      score,
      justificativa: null,
      avaliadoPor: input.userId,
    })
    return { id: created.id, codigo: created.codigo, categoriaRisco: created.categoriaRisco, scoreInerente: score }
  }
}
