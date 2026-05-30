import type { IContinuidadeRepository } from '@/modules/continuidade/domain/ports/IContinuidadeRepository.js'
import { DrExecucaoNotFoundError, DrExecucaoInvalidStatusError } from '@/modules/continuidade/domain/errors/ContinuidadeErrors.js'

export class ApproveDrExecucaoUseCase {
  constructor(private readonly repo: IContinuidadeRepository) {}

  async execute(tenantId: number, id: number, approvedByUserId: number) {
    const ex = await this.repo.getDrExecucaoById(tenantId, id)
    if (!ex) throw new DrExecucaoNotFoundError(id)

    const record = ex as { statusExecucao: string }
    if (record.statusExecucao !== 'PENDENTE_APROVACAO') {
      throw new DrExecucaoInvalidStatusError(record.statusExecucao)
    }

    await this.repo.approveDrExecucao(tenantId, id, { aprovadoPor: approvedByUserId })
  }
}
