import type { IContinuidadeRepository } from '@/domain/repositories/IContinuidadeRepository.js'
import type { ListBcpPlanosDto } from '@/application/dto/continuidade/listBcpPlanosDto.js'

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
