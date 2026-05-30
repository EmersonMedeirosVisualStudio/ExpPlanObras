import type { IGrcRepository } from '@/domain/repositories/IGrcRepository.js'

export interface CreateControleInput {
  tenantId: number
  userId: number
  codigo: string
  nome: string
  descricao?: string | null
  categoriaControle?: string | null
  tipoControle: string
  automacaoControle: string
  frequenciaExecucao?: string | null
  ownerUserId?: number | null
  executorTipo?: string | null
  evidenciaObrigatoria?: boolean
  ativo?: boolean
  criticidade: string
  objetivoControle?: string | null
  procedimentoExecucao?: string | null
}

export class CreateControle {
  constructor(private readonly repo: IGrcRepository) {}

  async execute(input: CreateControleInput) {
    const created = await this.repo.createControle({
      tenantId: input.tenantId,
      codigo: input.codigo.toUpperCase(),
      nome: input.nome,
      descricao: input.descricao ?? null,
      categoriaControle: input.categoriaControle ?? null,
      tipoControle: input.tipoControle,
      automacaoControle: input.automacaoControle,
      frequenciaExecucao: input.frequenciaExecucao ?? null,
      ownerUserId: typeof input.ownerUserId === 'number' ? input.ownerUserId : input.userId,
      executorTipo: input.executorTipo ?? null,
      evidenciaObrigatoria: input.evidenciaObrigatoria === true,
      ativo: input.ativo !== false,
      criticidade: input.criticidade,
      objetivoControle: input.objetivoControle ?? null,
      procedimentoExecucao: input.procedimentoExecucao ?? null,
    })
    return { id: created.id }
  }
}
