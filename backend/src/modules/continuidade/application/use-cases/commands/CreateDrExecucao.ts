import type { IContinuidadeRepository } from '@/modules/continuidade/domain/ports/IContinuidadeRepository.js'
import { BcpPlanoNotFoundError } from '@/modules/continuidade/domain/errors/ContinuidadeErrors.js'
import type { CreateDrExecucaoDto } from '@/modules/continuidade/application/dtos/createDrExecucaoDto.js'

export class CreateDrExecucaoUseCase {
  constructor(private readonly repo: IContinuidadeRepository) {}

  async execute(tenantId: number, dto: CreateDrExecucaoDto) {
    const plano = await this.repo.getBcpPlanoById(tenantId, dto.planoId)
    if (!plano) throw new BcpPlanoNotFoundError(dto.planoId)

    const statusExecucao = dto.aprovacaoExigida ? 'PENDENTE_APROVACAO' : 'EXECUTANDO'

    return this.repo.createDrExecucao(tenantId, {
      planoId: dto.planoId,
      origemTipo: dto.origemTipo,
      referenciaOrigem: dto.referenciaOrigem ?? null,
      tipoRecuperacao: dto.tipoRecuperacao,
      statusExecucao,
      aprovacaoExigida: dto.aprovacaoExigida ?? false,
      iniciadoEm: dto.aprovacaoExigida ? null : new Date(),
    })
  }
}
