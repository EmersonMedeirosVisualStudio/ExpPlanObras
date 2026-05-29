import { PrismaContratoRepository } from '@/modules/contratos/infrastructure/persistence/PrismaContratoRepository.js'
import { CreateContratoUseCase } from '@/modules/contratos/application/use-cases/CreateContrato.js'
import { GetContratoByIdUseCase } from '@/modules/contratos/application/use-cases/GetContratoById.js'
import { UpdateContratoUseCase } from '@/modules/contratos/application/use-cases/UpdateContrato.js'

export function makeContratoUseCases() {
  const repo = new PrismaContratoRepository()
  return {
    create: new CreateContratoUseCase(repo),
    update: new UpdateContratoUseCase(repo),
    getById: new GetContratoByIdUseCase(repo),
    repo,
  }
}
