import type { IContinuidadeRepository } from '@/domain/repositories/IContinuidadeRepository.js'
import type { CreateBcpPlanoDto } from '@/application/dto/continuidade/createBcpPlanoDto.js'

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
