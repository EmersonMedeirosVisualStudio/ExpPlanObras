import type { IContinuidadeRepository } from '@/modules/continuidade/domain/ports/IContinuidadeRepository.js'
import { DrExecucaoNotFoundError } from '@/modules/continuidade/domain/errors/ContinuidadeErrors.js'
import type { ConcludeDrExecucaoDto } from '@/modules/continuidade/application/dtos/concludeDrExecucaoDto.js'

export class ConcludeDrExecucaoUseCase {
  constructor(private readonly repo: IContinuidadeRepository) {}

  async execute(tenantId: number, id: number, dto: ConcludeDrExecucaoDto) {
    const ex = await this.repo.getDrExecucaoById(tenantId, id)
    if (!ex) throw new DrExecucaoNotFoundError(id)

    await this.repo.concludeDrExecucao(tenantId, id, {
      sucesso: dto.sucesso,
      rtoRealMinutos: dto.rtoRealMinutos ?? null,
      rpoRealMinutos: dto.rpoRealMinutos ?? null,
      resultadoResumoJson: dto.resultadoResumoJson ?? null,
    })
  }
}
