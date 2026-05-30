import type { IGrcRepository } from '@/modules/grc/domain/ports/IGrcRepository.js'
import { GrcAuditoriaNotFoundError } from '@/modules/grc/domain/errors/GrcErrors.js'

export interface EncerrarAuditoriaInput {
  id: number
  tenantId: number
  opiniaoFinal?: string | null
  ratingFinal?: string | null
}

export class EncerrarAuditoria {
  constructor(private readonly repo: IGrcRepository) {}

  async execute(input: EncerrarAuditoriaInput) {
    const auditoria = await this.repo.findUniqueAuditoria(input.id)
    if (!auditoria || auditoria.tenantId !== input.tenantId) {
      throw new GrcAuditoriaNotFoundError(input.id)
    }
    await this.repo.updateAuditoria(auditoria.id, {
      statusAuditoria: 'ENCERRADA',
      dataFimReal: new Date(),
      opiniaoFinal: input.opiniaoFinal ?? null,
      ratingFinal: input.ratingFinal ?? null,
    })
  }
}
