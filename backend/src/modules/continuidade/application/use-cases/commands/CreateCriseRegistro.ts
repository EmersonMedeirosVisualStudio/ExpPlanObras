import type { IContinuidadeRepository } from '@/modules/continuidade/domain/ports/IContinuidadeRepository.js'
import type { CreateCriseRegistroDto } from '@/modules/continuidade/application/dtos/createCriseRegistroDto.js'

export class CreateCriseRegistroUseCase {
  constructor(private readonly repo: IContinuidadeRepository) {}

  async execute(tenantId: number, dto: CreateCriseRegistroDto, comandanteUserId: number) {
    return this.repo.createCriseRegistro(tenantId, {
      codigo: dto.codigo,
      titulo: dto.titulo,
      descricao: dto.descricao ?? null,
      tipoCrise: dto.tipoCrise,
      severidade: dto.severidade,
      incidenteOrigemId: dto.incidenteOrigemId ?? null,
      planoAcionadoId: dto.planoAcionadoId ?? null,
      comandanteUserId,
    })
  }
}
