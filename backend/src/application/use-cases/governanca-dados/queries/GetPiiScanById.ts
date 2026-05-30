import type { IGovernancaDadosRepository } from '@/domain/repositories/IGovernancaDadosRepository.js'
import { PiiScanNotFoundError } from '@/domain/errors/GovernancaErrors.js'

export class GetPiiScanByIdUseCase {
  constructor(private readonly repo: IGovernancaDadosRepository) {}

  async execute(tenantId: number, id: number) {
    const scan = await this.repo.getPiiScanById(tenantId, id)
    if (!scan) throw new PiiScanNotFoundError(id)
    return scan
  }

  async executeWithResultados(tenantId: number, scanId: number) {
    const scan = await this.repo.getPiiScanById(tenantId, scanId)
    if (!scan) throw new PiiScanNotFoundError(scanId)
    const resultados = await this.repo.listPiiScanResultados(tenantId, scanId)
    return resultados
  }
}
