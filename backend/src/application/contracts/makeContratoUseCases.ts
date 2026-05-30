import { PrismaContratoRepository } from '@/infra/database/repositories/PrismaContratoRepository.js'
import { CreateContratoUseCase } from '@/application/use-cases/contratos/CreateContrato.js'
import { GetContratoByIdUseCase } from '@/application/use-cases/contratos/GetContratoById.js'
import { UpdateContratoUseCase } from '@/application/use-cases/contratos/UpdateContrato.js'

export function makeContratoUseCases() {
  const repo = new PrismaContratoRepository()
  return {
    create: new CreateContratoUseCase(repo),
    update: new UpdateContratoUseCase(repo),
    getById: new GetContratoByIdUseCase(repo),
    repo,
  }
}
