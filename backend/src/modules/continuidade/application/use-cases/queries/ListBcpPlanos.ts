import type { IContinuidadeRepository } from '@/modules/continuidade/domain/ports/IContinuidadeRepository.js'
import type { ListBcpPlanosDto } from '@/modules/continuidade/application/dtos/listBcpPlanosDto.js'

export class ListBcpPlanosUseCase {
  constructor(private readonly repo: IContinuidadeRepository) {}

  async execute(tenantId: number, dto: ListBcpPlanosDto) {
    const ativo = dto.ativo !== undefined ? String(dto.ativo).toLowerCase() === 'true' : undefined
    return this.repo.listBcpPlanos(tenantId, {
      tipo: dto.tipo ? String(dto.tipo).toUpperCase() : undefined,
      ativo,
      pagina: dto.pagina,
      limite: dto.limite,
    })
  }
}
