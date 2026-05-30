import type { IContinuidadeRepository } from '@/modules/continuidade/domain/ports/IContinuidadeRepository.js'
import type { CreateBcpPlanoDto } from '@/modules/continuidade/application/dtos/createBcpPlanoDto.js'

export class CreateBcpPlanoUseCase {
  constructor(private readonly repo: IContinuidadeRepository) {}

  async execute(tenantId: number, dto: CreateBcpPlanoDto, ownerUserId: number) {
    return this.repo.createBcpPlano(tenantId, {
      codigo: dto.codigo,
      nome: dto.nome,
      descricao: dto.descricao ?? null,
      tipoPlano: dto.tipoPlano,
      modulo: dto.modulo ?? null,
      criticidade: dto.criticidade,
      rtoMinutos: dto.rtoMinutos,
      rpoMinutos: dto.rpoMinutos,
      ownerUserId,
    })
  }
}
